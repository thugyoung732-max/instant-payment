-- ===========================================================================
-- INSTANT PAYMENT · the customer's own withdrawal fee
-- ===========================================================================
--
-- The pre-submit disclosure on the withdrawal screen must show the fee
-- `request_withdrawal` will actually record for the signed-in account. That fee
-- is the account's own row in public.withdrawal_account_fees when it carries an
-- amount, otherwise the global row in public.withdrawal_fee_settings
-- (id = 'default').
--
-- This migration adds one read-only function that answers exactly that question
-- for the caller. It has no arguments, so the account is always auth.uid() and
-- a caller cannot ask about anybody else.
--
-- RESOLUTION (one LEFT JOIN, no other sources)
--   * custom row with a non-NULL fee_cents -> that fee and that reason
--   * no custom row                      -> the global default
--   * custom row with NULL fee_cents     -> the global default
--   * custom fee of 0                    -> stays a custom 0 (never the default)
--
-- It never writes: withdrawal debits, approvals, rejections and refunds are
-- untouched, and no fee is ever taken from a wallet.
--
-- SECURITY
--   security definer (the caller needs no grant on either table), pinned
--   search_path, execute revoked from public/anon and granted only to
--   authenticated.
--
-- Safe to run more than once: `create or replace` plus idempotent grants.
--
-- Apply with the Supabase SQL editor, or:
--   supabase db push          (CLI, migrations/ is picked up automatically)
--   psql "$DATABASE_URL" -f supabase/migrations/20261124120000_customer_withdrawal_fee.sql
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. my_withdrawal_fee()
-- ---------------------------------------------------------------------------
-- Returns the camelCase shape `mapWithdrawalFeeSettings` reads in
-- src/lib/data/mappers.ts (feeCents, feeReason, updatedAt, updatedByUsername),
-- plus `isCustom` so the UI can tell an override from the default.
--
-- withdrawal_fee_settings is the left side on purpose: the canonical
-- id = 'default' row always exists, so the query always produces exactly one
-- row and the caller's custom row (if any) attaches to it. Putting the account
-- table on the right also lets the `fee_cents is not null` test live in the join
-- condition, which is what separates "custom fee of 0" from "no custom amount".

create or replace function public.my_withdrawal_fee()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_fee_cents bigint;
  v_fee_reason text;
  v_is_custom boolean;
  v_updated_at timestamptz;
  v_updated_by uuid;
  v_username text;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select
      coalesce(a.fee_cents, d.fee_cents, 0),
      case when a.fee_cents is not null then a.fee_reason else d.fee_reason end,
      (a.fee_cents is not null),
      coalesce(a.updated_at, d.updated_at),
      coalesce(a.updated_by, d.updated_by)
    into v_fee_cents, v_fee_reason, v_is_custom, v_updated_at, v_updated_by
    from public.withdrawal_fee_settings d
    left join public.withdrawal_account_fees a
      on a.user_id = v_uid
     and a.fee_cents is not null
   where d.id = 'default';

  -- Both tables store the author as a uuid; the UI renders a handle.
  if v_updated_by is not null then
    select p.username into v_username
      from public.profiles p
     where p.id = v_updated_by;
  end if;

  return jsonb_build_object(
    'feeCents', coalesce(v_fee_cents, 0),
    'feeReason', coalesce(v_fee_reason, ''),
    'isCustom', coalesce(v_is_custom, false),
    'updatedAt', v_updated_at,
    'updatedByUsername', v_username
  );
end;
$$;

comment on function public.my_withdrawal_fee() is
  'The calling customer''s effective flat withdrawal fee: their withdrawal_account_fees override, otherwise withdrawal_fee_settings (id = ''default''). Read-only and account-scoped via auth.uid(); never touches a balance.';

-- ---------------------------------------------------------------------------
-- 2. Execute grants
-- ---------------------------------------------------------------------------

revoke execute on function public.my_withdrawal_fee() from public, anon;
grant execute on function public.my_withdrawal_fee() to authenticated;

commit;
