-- ===========================================================================
-- INSTANT PAYMENT · flat withdrawal fee
-- ===========================================================================
--
-- One migration that takes an existing production database from "no fee" to
-- "admin-controlled flat fee". It is written to be safe to run more than once
-- and to be safe on a database that already has earlier drafts of these
-- objects: every table/column/index/policy is created only when missing, and
-- every function is `create or replace` (functions are the source of truth).
--
-- THE RULE THIS FILE ENFORCES
--   The fee is INFORMATIONAL. It is recorded on the request and shown to the
--   customer, but it never touches a balance:
--     * request_withdrawal debits exactly p_amount_cents.
--     * admin_resolve_withdrawal refunds exactly transactions.amount_cents.
--     * admin_update_withdrawal_fee may rewrite fee_cents/fee_reason on rows
--       that are still PENDING, and nothing else. Completed and declined rows
--       are never touched, and a fee change never moves money.
--
-- Canonical settings row: withdrawal_fee_settings.id = 'default'.
--
-- Apply with the Supabase SQL editor, or:
--   supabase db push          (CLI, migrations/ is picked up automatically)
--   psql "$DATABASE_URL" -f supabase/migrations/20261124090000_withdrawal_fee.sql
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The ledger remembers the fee it recorded
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column if not exists fee_reason text;

comment on column public.transactions.fee_reason is
  'Why the flat withdrawal fee was charged. Informational only: never debited or refunded.';

-- ---------------------------------------------------------------------------
-- 2. The single settings row
-- ---------------------------------------------------------------------------

create table if not exists public.withdrawal_fee_settings (
  id text primary key default 'default',
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  fee_reason text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Tolerate an earlier draft of this table: add whatever is missing instead of
-- failing, and let `id` start nullable so existing rows are never overwritten.
alter table public.withdrawal_fee_settings add column if not exists id text;
alter table public.withdrawal_fee_settings add column if not exists fee_cents bigint not null default 0;
alter table public.withdrawal_fee_settings add column if not exists fee_reason text not null default '';
alter table public.withdrawal_fee_settings add column if not exists updated_by uuid;
alter table public.withdrawal_fee_settings add column if not exists updated_at timestamptz not null default now();

-- The upsert target used by admin_update_withdrawal_fee().
create unique index if not exists withdrawal_fee_settings_id_key
  on public.withdrawal_fee_settings (id);

-- Seed the canonical row. When an earlier draft already holds a live fee under
-- a different key, its values are copied forward rather than silently zeroed.
insert into public.withdrawal_fee_settings (id, fee_cents, fee_reason, updated_at)
select 'default', older.fee_cents, older.fee_reason, coalesce(older.updated_at, now())
  from public.withdrawal_fee_settings older
 where older.id is distinct from 'default'
 order by older.updated_at desc nulls last
 limit 1
on conflict (id) do nothing;

insert into public.withdrawal_fee_settings (id) values ('default')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Read access for authenticated customers
-- ---------------------------------------------------------------------------
-- The fee is public pricing information: a signed-in customer must be able to
-- see it before requesting a withdrawal. Nothing else may write this table from
-- a client — there is no insert/update/delete policy anywhere, and the only
-- writer is the SECURITY DEFINER function below.

alter table public.withdrawal_fee_settings enable row level security;

revoke all on public.withdrawal_fee_settings from anon, authenticated;
grant select on public.withdrawal_fee_settings to authenticated;

drop policy if exists withdrawal_fee_settings_select_authenticated on public.withdrawal_fee_settings;
create policy withdrawal_fee_settings_select_authenticated on public.withdrawal_fee_settings
  for select to authenticated
  using (id = 'default');

-- Browser-safe projection, in the same style as public_chat_settings: the fee
-- and its reason, nothing else.
create or replace view public.public_withdrawal_fee_settings
with (security_invoker = false) as
  select
    fee_cents,
    fee_reason,
    updated_at
  from public.withdrawal_fee_settings
  where id = 'default';

grant select on public.public_withdrawal_fee_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 4. admin_get_withdrawal_fee()
-- ---------------------------------------------------------------------------

-- An earlier draft of this function may have returned a table or a row type;
-- `create or replace` cannot change a return type, so the signature is dropped
-- first. Nothing depends on these functions except the app's RPC calls, and the
-- grants are restored in section 9.
drop function if exists public.admin_get_withdrawal_fee();

create or replace function public.admin_get_withdrawal_fee()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.withdrawal_fee_settings;
  v_admin_username text;
begin
  perform public.assert_admin();

  select * into v_settings
    from public.withdrawal_fee_settings
   where id = 'default';

  if not found then
    return jsonb_build_object(
      'feeCents', 0,
      'feeReason', '',
      'updatedAt', null,
      'updatedByUsername', null
    );
  end if;

  if v_settings.updated_by is not null then
    select p.username into v_admin_username
      from public.profiles p
     where p.id = v_settings.updated_by;
  end if;

  return jsonb_build_object(
    'feeCents', coalesce(v_settings.fee_cents, 0),
    'feeReason', coalesce(v_settings.fee_reason, ''),
    'updatedAt', v_settings.updated_at,
    'updatedByUsername', v_admin_username
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. admin_update_withdrawal_fee(p_fee_cents, p_fee_reason, p_apply_to)
-- ---------------------------------------------------------------------------
-- p_apply_to is exactly FUTURE | PENDING | BOTH:
--   FUTURE  - only new requests get the new fee
--   PENDING - only rows still PENDING are re-stamped
--   BOTH    - new requests and pending rows
-- The UPDATE is pinned to status = 'PENDING', which is what makes completed and
-- declined withdrawals untouchable by a fee change.

drop function if exists public.admin_update_withdrawal_fee(bigint, text, text);

create or replace function public.admin_update_withdrawal_fee(
  p_fee_cents bigint,
  p_fee_reason text,
  p_apply_to text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.assert_admin();
  v_fee bigint := coalesce(p_fee_cents, 0);
  v_reason text := left(btrim(coalesce(p_fee_reason, '')), 120);
  v_apply text := upper(btrim(coalesce(p_apply_to, 'FUTURE')));
  v_updated integer := 0;
  v_settings public.withdrawal_fee_settings;
  v_admin_username text;
begin
  if v_fee < 0 or v_fee > 100000000 then
    raise exception 'INVALID_FEE_AMOUNT';
  end if;
  if v_apply not in ('FUTURE', 'PENDING', 'BOTH') then
    raise exception 'INVALID_APPLY_TO';
  end if;
  if v_fee > 0 and char_length(v_reason) < 3 then
    raise exception 'INVALID_FEE_REASON';
  end if;

  insert into public.withdrawal_fee_settings (id, fee_cents, fee_reason, updated_by, updated_at)
  values ('default', v_fee, v_reason, v_admin, now())
  on conflict (id) do update
    set fee_cents = excluded.fee_cents,
        fee_reason = excluded.fee_reason,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_settings;

  if v_apply in ('PENDING', 'BOTH') then
    update public.transactions
       set fee_cents = v_fee,
           fee_reason = case when v_fee > 0 then nullif(v_reason, '') else null end
     where type = 'WITHDRAWAL'
       and status = 'PENDING';

    get diagnostics v_updated = row_count;
  end if;

  select p.username into v_admin_username
    from public.profiles p
   where p.id = v_admin;

  return jsonb_build_object(
    'feeCents', v_settings.fee_cents,
    'feeReason', v_settings.fee_reason,
    'applyTo', v_apply,
    'updatedPending', v_updated,
    'updatedAt', v_settings.updated_at,
    'updatedByUsername', v_admin_username
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. request_withdrawal(p_amount_cents, p_destination)
-- ---------------------------------------------------------------------------
-- Holds exactly the requested amount, then records the stored fee beside it.
-- The caller cannot influence the fee: it is read from the settings table
-- inside this function, never passed in.

drop function if exists public.request_withdrawal(bigint, text);

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
  v_fee bigint := 0;
  v_fee_reason text;
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

  -- Lock the wallet so two requests cannot both spend the same funds.
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

  -- The active fee, read here rather than trusted from the request.
  select s.fee_cents, s.fee_reason
    into v_fee, v_fee_reason
    from public.withdrawal_fee_settings s
   where s.id = 'default';

  v_fee := coalesce(v_fee, 0);
  v_fee_reason := nullif(left(btrim(coalesce(v_fee_reason, '')), 120), '');

  perform public.allow_ledger_write();

  -- Exactly the requested amount is held. The fee is not part of this movement.
  update public.profiles
     set balance_cents = balance_cents - p_amount_cents
   where id = v_user.id
  returning * into v_user;

  insert into public.transactions (
    reference, type, status, amount_cents, fee_cents, fee_reason, destination,
    sender_id, sender_balance_after_cents
  ) values (
    public.new_reference('WDR'), 'WITHDRAWAL', 'PENDING', p_amount_cents, v_fee,
    case when v_fee > 0 then v_fee_reason else null end,
    v_destination, v_user.id, v_user.balance_cents
  )
  returning * into v_tx;

  return jsonb_build_object(
    'ok', true,
    'reference', v_tx.reference,
    'amountCents', v_tx.amount_cents,
    'feeCents', v_tx.fee_cents,
    'feeReason', v_tx.fee_reason,
    'totalCents', v_tx.amount_cents,
    'destination', v_tx.destination,
    'balanceAfterCents', v_user.balance_cents,
    'createdAt', v_tx.created_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. admin_resolve_withdrawal(p_transaction_id, p_outcome, p_reason)
-- ---------------------------------------------------------------------------
-- Approving only changes the status. Declining refunds exactly the requested
-- amount: the fee was never taken, so it is never given back either.
-- `for update` + the PENDING check is what makes a double refund impossible.

drop function if exists public.admin_resolve_withdrawal(uuid, text, text);

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
       set balance_cents = balance_cents + v_tx.amount_cents
     where id = v_tx.sender_id
    returning * into v_sender;

    v_refunded := v_tx.amount_cents;
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
    'refundedCents', v_refunded,
    'amountCents', v_tx.amount_cents,
    'feeCents', v_tx.fee_cents
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The request-shaped projection gains the fee reason
-- ---------------------------------------------------------------------------
-- Appended at the end of the column list: `create or replace view` can add
-- columns, but cannot reorder the ones already there.

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
    t.created_at,
    t.fee_reason
  from public.transactions t
  where t.type = 'WITHDRAWAL'
    and (
      t.sender_id = auth.uid()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
      )
    );

grant select on public.withdrawal_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Execute grants
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_get_withdrawal_fee() from public, anon;
revoke execute on function public.admin_update_withdrawal_fee(bigint, text, text) from public, anon;

grant execute on function public.admin_get_withdrawal_fee() to authenticated;
grant execute on function public.admin_update_withdrawal_fee(bigint, text, text) to authenticated;
grant execute on function public.request_withdrawal(bigint, text) to authenticated;
grant execute on function public.admin_resolve_withdrawal(uuid, text, text) to authenticated;

commit;
