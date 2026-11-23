-- ===========================================================================
-- INSTANT PAYMENT · Supabase schema
-- ---------------------------------------------------------------------------
-- Run this once in the Supabase SQL editor (or `supabase db push`).
--
-- Design rules, in order of importance:
--   1. Customers can never write to a table directly. Every balance movement
--      happens inside a SECURITY DEFINER function that reads the caller from
--      auth.uid(), so no client can act as somebody else.
--   2. `profiles.is_admin` and `profiles.balance_cents` are protected by a
--      trigger that refuses changes unless a database function deliberately
--      opened the door for the current transaction.
--   3. Read access is narrower than write access: the public projection of a
--      profile is a view without emails or balances.
--   4. Nothing here moves real money. Every row is a simulation.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type public.transaction_type as enum (
      'TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'WELCOME_BONUS', 'ADMIN_CREDIT', 'ADMIN_RESET'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    create type public.transaction_status as enum ('COMPLETED', 'PENDING', 'FAILED');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  username text not null unique
    check (username = lower(username) and username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_hue integer not null default 156 check (avatar_hue between 0 and 359),
  is_admin boolean not null default false,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  avatar_data_url text,
  avatar_mime text,
  avatar_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deposit_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9]{4,32}$'),
  label text,
  credit_cents bigint not null check (credit_cents > 0),
  active boolean not null default true,
  single_use boolean not null default false,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  last_used_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  type public.transaction_type not null,
  status public.transaction_status not null,
  amount_cents bigint not null check (amount_cents >= 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  note text,
  destination text,
  failure_reason text,
  sender_id uuid references public.profiles (id) on delete set null,
  recipient_id uuid references public.profiles (id) on delete set null,
  sender_balance_after_cents bigint,
  recipient_balance_after_cents bigint,
  deposit_code_id uuid references public.deposit_codes (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_sender_created_idx
  on public.transactions (sender_id, created_at desc);
create index if not exists transactions_recipient_created_idx
  on public.transactions (recipient_id, created_at desc);
create index if not exists transactions_status_idx on public.transactions (status, type);
create index if not exists transactions_deposit_code_idx on public.transactions (deposit_code_id);

create table if not exists public.chat_settings (
  id text primary key default 'default',
  enabled boolean not null default false,
  provider text not null default 'smartsupp',
  public_key text,
  secondary_key text,
  custom_script_url text,
  accent_color text not null default '#0f8a5f',
  position text not null default 'right' check (position in ('left', 'right')),
  welcome_message text,
  updated_at timestamptz not null default now()
);

insert into public.chat_settings (id) values ('default') on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helper: is the caller an administrator?
-- SECURITY DEFINER so the check itself never depends on the caller's RLS view.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Guard: only ledger functions may move money or grant admin
-- ---------------------------------------------------------------------------

create or replace function public.allow_ledger_write()
returns void
language sql
as $$
  select set_config('app.ledger_write', '1', true);
$$;

create or replace function public.guard_profile_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and coalesce(current_setting('app.ledger_write', true), '') <> '1' then
    raise exception 'ADMIN_FLAG_IMMUTABLE' using
      hint = 'is_admin is only changed by a database owner, never by an application request';
  end if;

  if new.balance_cents is distinct from old.balance_cents
     and coalesce(current_setting('app.ledger_write', true), '') <> '1' then
    raise exception 'BALANCE_IMMUTABLE' using
      hint = 'balances change only through send_transfer / redeem_deposit_code / withdrawal functions';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_writes on public.profiles;
create trigger profiles_guard_writes
  before update on public.profiles
  for each row execute function public.guard_profile_writes();

-- ---------------------------------------------------------------------------
-- Profile provisioning: one profile per auth user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text;
  v_display text;
begin
  v_handle := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  v_display := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), v_handle);

  if v_handle !~ '^[a-z0-9_]{3,20}$' then
    v_handle := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  begin
    insert into public.profiles (id, email, username, display_name, avatar_hue)
    values (
      new.id,
      lower(new.email),
      v_handle,
      left(v_display, 40),
      (abs(hashtext(v_handle)) % 360)
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, email, username, display_name, avatar_hue)
    values (
      new.id,
      lower(new.email),
      v_handle || '_' || substr(replace(new.id::text, '-', ''), 1, 4),
      left(v_display, 40),
      (abs(hashtext(v_handle)) % 360)
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Read projections
-- ---------------------------------------------------------------------------

-- Everything a customer may see about another customer: no email, no balance,
-- no role flag.
create or replace view public.public_profiles
with (security_invoker = false) as
  select
    id,
    username,
    display_name,
    avatar_hue,
    avatar_data_url,
    avatar_updated_at,
    created_at
  from public.profiles;

-- The browser-safe slice of the chat configuration. The provider key is public
-- by design (it ships in the page); nothing else is.
create or replace view public.public_chat_settings
with (security_invoker = false) as
  select
    enabled,
    provider,
    public_key,
    secondary_key,
    custom_script_url,
    accent_color,
    position,
    welcome_message
  from public.chat_settings
  where id = 'default';

-- The codes a customer touched: their own receipts can name the code they used
-- without exposing the whole issue list to every visitor.
create or replace view public.my_deposit_codes
with (security_invoker = false) as
  select dc.id, dc.code, dc.label, dc.credit_cents, dc.active, dc.max_uses, dc.uses, dc.created_at
  from public.deposit_codes dc
  where public.is_admin()
     or exists (
       select 1
       from public.transactions t
       where t.deposit_code_id = dc.id
         and (t.sender_id = auth.uid() or t.recipient_id = auth.uid())
     );

-- Withdrawal requests are ledger rows of type WITHDRAWAL. This view gives the
-- console a request-shaped projection without duplicating the money state in a
-- second table.
create or replace view public.withdrawal_requests
with (security_invoker = false) as
  select
    t.id,
    t.reference,
    t.status,
    t.amount_cents,
    t.fee_cents,
    t.destination,
    t.note,
    t.failure_reason,
    t.sender_id,
    t.sender_balance_after_cents as balance_after_cents,
    t.resolved_at,
    t.resolved_by,
    t.created_at
  from public.transactions t
  where t.type = 'WITHDRAWAL'
    and (t.sender_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.deposit_codes enable row level security;
alter table public.transactions enable row level security;
alter table public.chat_settings enable row level security;

-- Tables: read only for clients. No insert/update/delete policy exists anywhere,
-- which is what makes "customers cannot edit their own balance" structural
-- rather than a convention the code has to remember.
revoke all on public.profiles from anon, authenticated;
revoke all on public.deposit_codes from anon, authenticated;
revoke all on public.transactions from anon, authenticated;
revoke all on public.chat_settings from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.deposit_codes to authenticated;
grant select on public.transactions to authenticated;
grant select on public.chat_settings to authenticated;

grant select on public.public_profiles to anon, authenticated;
grant select on public.public_chat_settings to anon, authenticated;
grant select on public.withdrawal_requests to authenticated;
grant select on public.my_deposit_codes to authenticated;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists deposit_codes_select_admin on public.deposit_codes;
create policy deposit_codes_select_admin on public.deposit_codes
  for select to authenticated
  using (public.is_admin());

drop policy if exists transactions_select_participant_or_admin on public.transactions;
create policy transactions_select_participant_or_admin on public.transactions
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());

drop policy if exists chat_settings_select_admin on public.chat_settings;
create policy chat_settings_select_admin on public.chat_settings
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- References
-- ---------------------------------------------------------------------------

create or replace function public.new_reference(prefix text)
returns text
language sql
volatile
as $$
  select prefix || '-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
$$;

-- ---------------------------------------------------------------------------
-- Identity helpers (auth flows)
-- ---------------------------------------------------------------------------

-- Lets the sign-in form accept "@handle" as well as an email address. Only an
-- exact handle/email match resolves, and it returns nothing else about the row.
create or replace function public.email_for_identifier(identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.email
  from public.profiles p
  where p.username = lower(regexp_replace(btrim(coalesce(identifier, '')), '^@+', ''))
     or p.email = lower(btrim(coalesce(identifier, '')))
  limit 1;
$$;

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles p
    where p.username = lower(regexp_replace(btrim(coalesce(candidate, '')), '^@+', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- Customer operations
-- ---------------------------------------------------------------------------

create or replace function public.send_transfer(
  p_recipient text,
  p_amount_cents bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender public.profiles;
  v_recipient public.profiles;
  v_handle text := lower(regexp_replace(btrim(coalesce(p_recipient, '')), '^@+', ''));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 120), '');
  v_tx public.transactions;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  end if;

  select * into v_sender from public.profiles where id = auth.uid() for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  select * into v_recipient from public.profiles where username = v_handle;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'RECIPIENT_NOT_FOUND');
  end if;
  if v_recipient.id = v_sender.id then
    return jsonb_build_object('ok', false, 'code', 'SELF_TRANSFER');
  end if;

  if v_sender.balance_cents < p_amount_cents then
    -- A declined attempt is still an audit row; no balance is touched. The
    -- function returns instead of raising so this row commits.
    insert into public.transactions (
      reference, type, status, amount_cents, fee_cents, note, failure_reason,
      sender_id, recipient_id
    ) values (
      public.new_reference('TRF'), 'TRANSFER', 'FAILED', p_amount_cents, 0, v_note,
      'Your available balance is too low for this transfer.',
      v_sender.id, v_recipient.id
    );
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_FUNDS');
  end if;

  perform public.allow_ledger_write();

  update public.profiles
     set balance_cents = balance_cents - p_amount_cents
   where id = v_sender.id
  returning * into v_sender;

  update public.profiles
     set balance_cents = balance_cents + p_amount_cents
   where id = v_recipient.id
  returning * into v_recipient;

  insert into public.transactions (
    reference, type, status, amount_cents, fee_cents, note,
    sender_id, recipient_id, sender_balance_after_cents, recipient_balance_after_cents
  ) values (
    public.new_reference('TRF'), 'TRANSFER', 'COMPLETED', p_amount_cents, 0, v_note,
    v_sender.id, v_recipient.id, v_sender.balance_cents, v_recipient.balance_cents
  )
  returning * into v_tx;

  return jsonb_build_object(
    'ok', true,
    'reference', v_tx.reference,
    'amountCents', v_tx.amount_cents,
    'note', v_tx.note,
    'createdAt', v_tx.created_at,
    'senderBalanceAfterCents', v_sender.balance_cents,
    'recipientUsername', v_recipient.username,
    'recipientDisplayName', v_recipient.display_name,
    'recipientAvatarHue', v_recipient.avatar_hue
  );
end;
$$;

create or replace function public.redeem_deposit_code(
  p_code text,
  p_declared_cents bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_text text := upper(regexp_replace(btrim(coalesce(p_code, '')), '[\s-]', '', 'g'));
  v_declared bigint := case when p_declared_cents is null or p_declared_cents <= 0 then null else p_declared_cents end;
  v_user public.profiles;
  v_code public.deposit_codes;
  v_tx public.transactions;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  select * into v_user from public.profiles where id = auth.uid() for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  select * into v_code from public.deposit_codes where code = v_code_text for update;

  if not found or not v_code.active then
    insert into public.transactions (
      reference, type, status, amount_cents, fee_cents, failure_reason, recipient_id
    ) values (
      public.new_reference('DEP'), 'DEPOSIT', 'FAILED', coalesce(v_declared, 0), 0,
      'That deposit code isn''t recognised.', v_user.id
    );
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE');
  end if;

  if (v_code.single_use and v_code.uses >= 1)
     or (v_code.max_uses is not null and v_code.uses >= v_code.max_uses) then
    insert into public.transactions (
      reference, type, status, amount_cents, fee_cents, failure_reason,
      recipient_id, deposit_code_id
    ) values (
      public.new_reference('DEP'), 'DEPOSIT', 'FAILED', coalesce(v_declared, 0), 0,
      'That deposit code has already been used.', v_user.id, v_code.id
    );
    return jsonb_build_object('ok', false, 'code', 'CODE_EXHAUSTED');
  end if;

  perform public.allow_ledger_write();

  update public.deposit_codes
     set uses = uses + 1,
         last_used_at = now()
   where id = v_code.id
  returning * into v_code;

  -- The credited amount always comes from the code, never from the form.
  update public.profiles
     set balance_cents = balance_cents + v_code.credit_cents
   where id = v_user.id
  returning * into v_user;

  insert into public.transactions (
    reference, type, status, amount_cents, fee_cents, note,
    recipient_id, recipient_balance_after_cents, deposit_code_id
  ) values (
    public.new_reference('DEP'), 'DEPOSIT', 'COMPLETED', v_code.credit_cents, 0,
    case when v_code.label is null then 'Deposit code ' || v_code.code else 'Deposit · ' || v_code.label end,
    v_user.id, v_user.balance_cents, v_code.id
  )
  returning * into v_tx;

  return jsonb_build_object(
    'ok', true,
    'reference', v_tx.reference,
    'creditedCents', v_tx.amount_cents,
    'declaredCents', v_declared,
    'balanceAfterCents', v_user.balance_cents,
    'code', v_code.code,
    'codeLabel', v_code.label,
    'createdAt', v_tx.created_at
  );
end;
$$;

create or replace function public.request_withdrawal(
  p_amount_cents bigint,
  p_destination text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles;
  v_destination text := left(btrim(coalesce(p_destination, '')), 160);
  v_tx public.transactions;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  end if;
  if char_length(v_destination) < 4 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DESTINATION');
  end if;

  select * into v_user from public.profiles where id = auth.uid() for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  if v_user.balance_cents < p_amount_cents then
    insert into public.transactions (
      reference, type, status, amount_cents, fee_cents, destination, failure_reason, sender_id
    ) values (
      public.new_reference('WDR'), 'WITHDRAWAL', 'FAILED', p_amount_cents, 0, v_destination,
      'Your available balance is too low for this withdrawal.', v_user.id
    );
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_FUNDS');
  end if;

  perform public.allow_ledger_write();

  -- The amount is held, so the same funds cannot be requested twice.
  update public.profiles
     set balance_cents = balance_cents - p_amount_cents
   where id = v_user.id
  returning * into v_user;

  insert into public.transactions (
    reference, type, status, amount_cents, fee_cents, destination,
    sender_id, sender_balance_after_cents
  ) values (
    public.new_reference('WDR'), 'WITHDRAWAL', 'PENDING', p_amount_cents, 0, v_destination,
    v_user.id, v_user.balance_cents
  )
  returning * into v_tx;

  return jsonb_build_object(
    'ok', true,
    'reference', v_tx.reference,
    'amountCents', v_tx.amount_cents,
    'feeCents', v_tx.fee_cents,
    'totalCents', v_tx.amount_cents + v_tx.fee_cents,
    'destination', v_tx.destination,
    'balanceAfterCents', v_user.balance_cents,
    'createdAt', v_tx.created_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile self-service
-- ---------------------------------------------------------------------------

create or replace function public.update_identity(
  p_username text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text := lower(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''));
  v_display text := btrim(coalesce(p_display_name, ''));
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'That handle is not valid.';
  end if;
  if char_length(v_display) < 2 then
    raise exception 'Tell us what to call you.';
  end if;

  if exists (select 1 from public.profiles where username = v_handle and id <> v_me) then
    raise exception 'USERNAME_TAKEN';
  end if;

  if exists (
    select 1 from public.profiles
    where id <> v_me
      and (username = lower(v_display) or lower(display_name) = v_handle)
  ) then
    raise exception 'CONFUSING_IDENTITY';
  end if;

  update public.profiles
     set username = v_handle,
         display_name = left(v_display, 40)
   where id = v_me;

  return jsonb_build_object('username', v_handle, 'displayName', left(v_display, 40));
end;
$$;

create or replace function public.set_avatar(p_data_url text, p_mime text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_data_url is null or p_data_url not like 'data:image/%' then
    raise exception 'INVALID_IMAGE';
  end if;

  update public.profiles
     set avatar_data_url = p_data_url,
         avatar_mime = coalesce(p_mime, 'image/png'),
         avatar_updated_at = now()
   where id = auth.uid();
end;
$$;

create or replace function public.clear_avatar()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  update public.profiles
     set avatar_data_url = null,
         avatar_mime = null,
         avatar_updated_at = null
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrator operations
-- ---------------------------------------------------------------------------

create or replace function public.assert_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  return v_me;
end;
$$;

create or replace function public.admin_credit(
  p_user_id uuid,
  p_amount_cents bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.assert_admin();
  v_user public.profiles;
  v_note text;
begin
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if abs(p_amount_cents) > 100000000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_user from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  v_note := coalesce(
    nullif(left(btrim(coalesce(p_note, '')), 120), ''),
    'Balance adjustment by admin'
  );

  perform public.allow_ledger_write();

  update public.profiles
     set balance_cents = balance_cents + p_amount_cents
   where id = v_user.id
  returning * into v_user;

  insert into public.transactions (
    reference, type, status, amount_cents, fee_cents, note,
    sender_id, recipient_id, recipient_balance_after_cents
  ) values (
    public.new_reference('ADJ'),
    case when p_amount_cents >= 0 then 'ADMIN_CREDIT'::public.transaction_type
         else 'ADMIN_RESET'::public.transaction_type end,
    'COMPLETED', abs(p_amount_cents), 0, v_note,
    v_admin, v_user.id, v_user.balance_cents
  );

  return jsonb_build_object(
    'username', v_user.username,
    'balanceCents', v_user.balance_cents
  );
end;
$$;

create or replace function public.admin_reset_balance(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.assert_admin();
  v_user public.profiles;
  v_cleared bigint;
begin
  select * into v_user from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  v_cleared := v_user.balance_cents;

  if v_cleared <> 0 then
    perform public.allow_ledger_write();

    update public.profiles set balance_cents = 0 where id = v_user.id returning * into v_user;

    insert into public.transactions (
      reference, type, status, amount_cents, fee_cents, note,
      sender_id, recipient_id, recipient_balance_after_cents
    ) values (
      public.new_reference('ADJ'), 'ADMIN_RESET', 'COMPLETED', v_cleared, 0,
      'Balance reset by admin', v_admin, v_user.id, 0
    );
  end if;

  return jsonb_build_object(
    'username', v_user.username,
    'clearedCents', v_cleared,
    'balanceCents', v_user.balance_cents
  );
end;
$$;

create or replace function public.admin_create_deposit_code(
  p_code text,
  p_credit_cents bigint,
  p_label text,
  p_single_use boolean,
  p_max_uses integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.assert_admin();
  v_code_text text := upper(regexp_replace(btrim(coalesce(p_code, '')), '[\s-]', '', 'g'));
  v_max integer := case when coalesce(p_single_use, false) then 1 else p_max_uses end;
  v_code public.deposit_codes;
begin
  if v_code_text !~ '^[A-Z0-9]{4,32}$' then
    raise exception 'INVALID_CODE_FORMAT';
  end if;
  if p_credit_cents is null or p_credit_cents <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if exists (select 1 from public.deposit_codes where code = v_code_text) then
    raise exception 'CODE_EXISTS';
  end if;

  insert into public.deposit_codes (
    code, label, credit_cents, active, single_use, max_uses, created_by
  ) values (
    v_code_text,
    nullif(left(btrim(coalesce(p_label, '')), 60), ''),
    p_credit_cents, true, coalesce(p_single_use, false), v_max, v_admin
  )
  returning * into v_code;

  return jsonb_build_object(
    'code', v_code.code,
    'creditCents', v_code.credit_cents,
    'maxUses', v_code.max_uses
  );
end;
$$;

create or replace function public.admin_set_code_active(p_code_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.deposit_codes;
begin
  perform public.assert_admin();

  update public.deposit_codes
     set active = coalesce(p_active, false)
   where id = p_code_id
  returning * into v_code;

  if not found then
    raise exception 'CODE_NOT_FOUND';
  end if;

  return jsonb_build_object('code', v_code.code, 'active', v_code.active);
end;
$$;

create or replace function public.admin_delete_deposit_code(p_code_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.deposit_codes;
  v_redemptions bigint;
begin
  perform public.assert_admin();

  select * into v_code from public.deposit_codes where id = p_code_id;
  if not found then
    raise exception 'CODE_NOT_FOUND';
  end if;

  select count(*) into v_redemptions
  from public.transactions
  where deposit_code_id = v_code.id;

  -- Codes that funded deposits stay in the ledger for audit.
  if v_redemptions > 0 then
    update public.deposit_codes set active = false where id = v_code.id;
    return jsonb_build_object(
      'code', v_code.code,
      'deleted', false,
      'redemptions', v_redemptions
    );
  end if;

  delete from public.deposit_codes where id = v_code.id;
  return jsonb_build_object('code', v_code.code, 'deleted', true, 'redemptions', 0);
end;
$$;

create or replace function public.admin_seed_deposit_codes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.assert_admin();
  v_created integer := 0;
begin
  insert into public.deposit_codes (code, label, credit_cents, single_use, max_uses, created_by)
  values
    ('ABC123', 'Welcome deposit', 50000, true, 1, v_admin),
    ('TESTER25', 'QA allowance', 2500, false, 10, v_admin),
    ('PAYDAY500', 'Campaign top-up', 50000, false, 5, v_admin)
  on conflict (code) do nothing;

  get diagnostics v_created = row_count;
  return jsonb_build_object('created', v_created);
end;
$$;

create or replace function public.admin_resolve_withdrawal(
  p_transaction_id uuid,
  p_outcome text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.assert_admin();
  v_tx public.transactions;
  v_sender public.profiles;
  v_refunded bigint := 0;
  v_outcome public.transaction_status;
begin
  if p_outcome not in ('COMPLETED', 'FAILED') then
    raise exception 'INVALID_OUTCOME';
  end if;
  v_outcome := p_outcome::public.transaction_status;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or v_tx.type <> 'WITHDRAWAL' then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;
  if v_tx.status <> 'PENDING' then
    raise exception 'WITHDRAWAL_ALREADY_RESOLVED';
  end if;

  if v_outcome = 'FAILED' and v_tx.sender_id is not null then
    perform public.allow_ledger_write();

    update public.profiles
       set balance_cents = balance_cents + v_tx.amount_cents + v_tx.fee_cents
     where id = v_tx.sender_id
    returning * into v_sender;

    v_refunded := v_tx.amount_cents + v_tx.fee_cents;
  end if;

  update public.transactions
     set status = v_outcome,
         resolved_at = now(),
         resolved_by = v_admin,
         failure_reason = case when v_outcome = 'FAILED'
                               then coalesce(nullif(left(btrim(coalesce(p_reason, '')), 120), ''), 'Withdrawal declined')
                               else null end,
         sender_balance_after_cents = case when v_outcome = 'FAILED'
                                           then v_sender.balance_cents
                                           else sender_balance_after_cents end
   where id = v_tx.id
  returning * into v_tx;

  return jsonb_build_object(
    'reference', v_tx.reference,
    'status', v_tx.status,
    'refundedCents', v_refunded
  );
end;
$$;

create or replace function public.admin_delete_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.assert_admin();
  v_tx public.transactions;
  v_released bigint := 0;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;

  if v_tx.type = 'WITHDRAWAL' and v_tx.status = 'PENDING' and v_tx.sender_id is not null then
    perform public.allow_ledger_write();

    update public.profiles
       set balance_cents = balance_cents + v_tx.amount_cents + v_tx.fee_cents
     where id = v_tx.sender_id;

    v_released := v_tx.amount_cents + v_tx.fee_cents;
  end if;

  if v_tx.deposit_code_id is not null then
    update public.deposit_codes
       set uses = greatest(0, uses - 1)
     where id = v_tx.deposit_code_id;
    update public.deposit_codes
       set last_used_at = null
     where id = v_tx.deposit_code_id and uses = 0;
  end if;

  delete from public.transactions where id = v_tx.id;

  return jsonb_build_object(
    'reference', v_tx.reference,
    'releasedCents', v_released
  );
end;
$$;

create or replace function public.admin_clear_transactions(p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.assert_admin();
  v_row public.transactions;
  v_deleted integer := 0;
  v_released bigint := 0;
  v_freed integer := 0;
  v_scope text := upper(coalesce(p_scope, 'SETTLED'));
begin
  if v_scope not in ('ALL', 'SETTLED') then
    raise exception 'INVALID_SCOPE';
  end if;

  perform public.allow_ledger_write();

  for v_row in
    select * from public.transactions
    where v_scope = 'ALL' or status in ('COMPLETED', 'FAILED')
    for update
  loop
    if v_row.type = 'WITHDRAWAL' and v_row.status = 'PENDING' and v_row.sender_id is not null then
      update public.profiles
         set balance_cents = balance_cents + v_row.amount_cents + v_row.fee_cents
       where id = v_row.sender_id;
      v_released := v_released + v_row.amount_cents + v_row.fee_cents;
    end if;

    if v_row.deposit_code_id is not null then
      update public.deposit_codes
         set uses = greatest(0, uses - 1)
       where id = v_row.deposit_code_id;
      v_freed := v_freed + 1;
    end if;

    delete from public.transactions where id = v_row.id;
    v_deleted := v_deleted + 1;
  end loop;

  update public.deposit_codes set last_used_at = null where uses = 0;

  return jsonb_build_object(
    'deletedCount', v_deleted,
    'releasedCents', v_released,
    'freedCodes', v_freed
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Live chat configuration
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_chat_settings(
  p_enabled boolean,
  p_provider text,
  p_public_key text,
  p_secondary_key text,
  p_custom_script_url text,
  p_accent_color text,
  p_position text,
  p_welcome_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  insert into public.chat_settings (
    id, enabled, provider, public_key, secondary_key, custom_script_url,
    accent_color, position, welcome_message, updated_at
  ) values (
    'default',
    coalesce(p_enabled, false),
    coalesce(nullif(btrim(coalesce(p_provider, '')), ''), 'smartsupp'),
    nullif(btrim(coalesce(p_public_key, '')), ''),
    nullif(btrim(coalesce(p_secondary_key, '')), ''),
    nullif(btrim(coalesce(p_custom_script_url, '')), ''),
    coalesce(nullif(btrim(coalesce(p_accent_color, '')), ''), '#0f8a5f'),
    case when p_position = 'left' then 'left' else 'right' end,
    nullif(btrim(coalesce(p_welcome_message, '')), ''),
    now()
  )
  on conflict (id) do update set
    enabled = excluded.enabled,
    provider = excluded.provider,
    public_key = excluded.public_key,
    secondary_key = excluded.secondary_key,
    custom_script_url = excluded.custom_script_url,
    accent_color = excluded.accent_color,
    position = excluded.position,
    welcome_message = excluded.welcome_message,
    updated_at = now();
end;
$$;

create or replace function public.admin_set_chat_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  insert into public.chat_settings (id, enabled, updated_at)
  values ('default', coalesce(p_enabled, false), now())
  on conflict (id) do update set enabled = excluded.enabled, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants
-- ---------------------------------------------------------------------------

revoke execute on function public.assert_admin() from public, anon, authenticated;
revoke execute on function public.allow_ledger_write() from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.email_for_identifier(text) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.new_reference(text) to authenticated;

grant execute on function public.send_transfer(text, bigint, text) to authenticated;
grant execute on function public.redeem_deposit_code(text, bigint) to authenticated;
grant execute on function public.request_withdrawal(bigint, text) to authenticated;

grant execute on function public.update_identity(text, text) to authenticated;
grant execute on function public.set_avatar(text, text) to authenticated;
grant execute on function public.clear_avatar() to authenticated;

grant execute on function public.admin_credit(uuid, bigint, text) to authenticated;
grant execute on function public.admin_reset_balance(uuid) to authenticated;
grant execute on function public.admin_create_deposit_code(text, bigint, text, boolean, integer) to authenticated;
grant execute on function public.admin_set_code_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_deposit_code(uuid) to authenticated;
grant execute on function public.admin_seed_deposit_codes() to authenticated;
grant execute on function public.admin_resolve_withdrawal(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_transaction(uuid) to authenticated;
grant execute on function public.admin_clear_transactions(text) to authenticated;
grant execute on function public.admin_save_chat_settings(boolean, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_set_chat_enabled(boolean) to authenticated;
