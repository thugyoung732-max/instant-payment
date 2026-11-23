-- ===========================================================================
-- INSTANT PAYMENT · demo data (optional)
-- ---------------------------------------------------------------------------
-- Run AFTER supabase/schema.sql, once, in the Supabase SQL editor.
--
-- It creates the sandbox roster the screens advertise:
--   @ada / sandbox123            → operations console (administrator)
--   @adaeze, @tunde_b, @mira,
--   @satoshi_fan, @zoe, @peter_o → customers, password sandbox123
--
-- Every account is a simulation with no real money attached. Skip this file if
-- you would rather register accounts through the sign-up screen; then promote
-- your own account with the last statement in this file.
-- ===========================================================================

-- The profile guard refuses balance/admin changes unless a database function
-- opened the door. The seed is such a function, so it opens it explicitly for
-- this session only.
select set_config('app.ledger_write', '1', false);

-- ---------------------------------------------------------------------------
-- 1. Sandbox accounts
-- ---------------------------------------------------------------------------

do $$
declare
  v_account record;
  v_user_id uuid;
  v_password text := 'sandbox123';
begin
  for v_account in
    select * from (values
      ('ada',        'ada@instantpayment.app', 'Ada Okafor',          250000::bigint, true),
      ('adaeze',     'adaeze@demo.fairmoney',  'Adaeze Okonkwo',      412550::bigint, false),
      ('tunde_b',    'tunde_b@demo.fairmoney', 'Tunde Bakare',         96400::bigint, false),
      ('mira',       'mira@demo.fairmoney',    'Mira Castellanos',   1275000::bigint, false),
      ('satoshi_fan','satoshi_fan@demo.fairmoney','Kenji Watanabe',    78900::bigint, false),
      ('zoe',        'zoe@demo.fairmoney',     'Zoe Lindqvist',       305000::bigint, false),
      ('peter_o',    'peter_o@demo.fairmoney', 'Peter Oyelaran',       24500::bigint, false)
    ) as t (username, email, display_name, balance_cents, is_admin)
  loop
    -- Already provisioned? Leave the account (and its balance) untouched.
    continue when exists (select 1 from public.profiles p where p.username = v_account.username);

    v_user_id := gen_random_uuid();

    begin
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_account.email,
        crypt(v_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', v_account.username, 'display_name', v_account.display_name),
        now(),
        now()
      );

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(),
        v_user_id,
        v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_account.email),
        'email',
        now(),
        now(),
        now()
      );
    exception when others then
      raise warning 'Could not seed % (%): % — register it from the sign-up screen instead.',
        v_account.username, v_account.email, sqlerrm;
      continue;
    end;

    -- The trigger above already created the profile row; stamp the role and the
    -- opening balance as an auditable ledger row.
    update public.profiles
       set is_admin = v_account.is_admin
     where id = v_user_id;

    if v_account.balance_cents > 0 then
      update public.profiles
         set balance_cents = v_account.balance_cents
       where id = v_user_id;

      insert into public.transactions (
        reference, type, status, amount_cents, fee_cents, note,
        recipient_id, recipient_balance_after_cents
      ) values (
        public.new_reference('ADJ'), 'ADMIN_CREDIT', 'COMPLETED',
        v_account.balance_cents, 0, 'Seeded test balance',
        v_user_id, v_account.balance_cents
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Sample deposit codes
-- ---------------------------------------------------------------------------

insert into public.deposit_codes (code, label, credit_cents, single_use, max_uses)
values
  ('ABC123',   'Welcome deposit',   50000, true,  1),
  ('TESTER25', 'QA allowance',       2500, false, 10),
  ('PAYDAY500','Campaign top-up',   50000, false, 5)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Promote yourself to administrator
-- ---------------------------------------------------------------------------
-- Admins are made in the database, never from the app: `is_admin` is not
-- writable by any customer function or RLS policy. Uncomment and run this after
-- registering through the sign-up screen:
--
--   select set_config('app.ledger_write', '1', false);
--   update public.profiles set is_admin = true where username = 'your_handle';
--
