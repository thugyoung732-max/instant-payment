# INSTANT PAYMENT · Supabase setup

Everything the wallet stores now lives in Supabase: accounts and sessions in
Supabase Auth, and profiles, balances, transactions, deposit codes, withdrawal
requests and the live-chat settings in Postgres with Row Level Security.

Nothing here moves real money. Transfers, deposit-code redemptions and
withdrawals are simulations recorded in a ledger.

---

## 1. Create the schema

Open your Supabase project → **SQL Editor** → paste and run
[`schema.sql`](./schema.sql).

It creates:

| Object | Purpose |
| --- | --- |
| `profiles` | one row per auth user: handle, name, role, balance, avatar |
| `transactions` | the ledger: transfers, deposits, withdrawals, admin adjustments |
| `deposit_codes` | issued codes, their amount and redemption capacity |
| `chat_settings` | the single live-chat configuration row |
| `public_profiles` (view) | safe projection of a profile: no email, no balance |
| `my_deposit_codes` (view) | the codes a customer's own receipts reference |
| `withdrawal_requests` (view) | request-shaped projection of `WITHDRAWAL` rows |
| `public_chat_settings` (view) | the browser-safe chat configuration |

Withdrawal requests are deliberately **not** a second table. A request is a
`transactions` row of type `WITHDRAWAL` with status `PENDING`; duplicating it
would give the balance two sources of truth. `withdrawal_requests` exposes the
same rows in a request shape for the console.

## 2. Create the demo roster (optional)

Run [`seed.sql`](./seed.sql) once. It creates `@ada` (administrator) and the
sandbox profiles `@adaeze`, `@tunde_b`, `@mira`, `@satoshi_fan`, `@zoe`,
`@peter_o`, all with the password `sandbox123`, plus the sample deposit codes
`ABC123`, `TESTER25` and `PAYDAY500`.

If that script cannot create auth users in your project, register the accounts
through the sign-up screen instead and promote your own account:

```sql
select set_config('app.ledger_write', '1', false);
update public.profiles set is_admin = true where username = 'your_handle';
```

Administrators are only ever created in the database. No application code and no
policy can set `is_admin`.

## 3. Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# optional: only used by the console's "Seed demo accounts" button
SUPABASE_SERVICE_ROLE_KEY=
```

Both public values are safe in the browser — every request is still filtered by
Row Level Security. The service-role key is **never** imported by client code; it
is read only inside one server action and only when it is present.

If the two public values are missing or still contain placeholders, the sign-in
screen explains what to add instead of failing silently.

## 4. Auth settings

In **Authentication → Sign In / Providers → Email**:

- Turn **Confirm email** off for the prototype. With it on, `signUp` returns no
  session and the app tells the visitor to confirm before signing in.
- Set **Site URL** to the address you open the app from, and add it to the
  redirect allow-list.

Sign-in accepts an email address **or** an `@handle`
(`public.email_for_identifier` resolves the handle server-side).

## 5. Security model

- No client has `INSERT`, `UPDATE` or `DELETE` on any table. The revokes are in
  `schema.sql`; correctness does not depend on application code remembering to
  be careful.
- Every money movement is one `SECURITY DEFINER` function that takes the actor
  from `auth.uid()`, locks the affected rows, checks the balance and writes the
  ledger row inside the same transaction. Concurrent transfers cannot overdraw a
  balance.
- A trigger refuses any change to `profiles.balance_cents` or
  `profiles.is_admin` unless a ledger function opened the door for the current
  transaction.
- `admin_*` functions call `assert_admin()`, which raises unless the caller's
  profile has `is_admin = true`. The console also checks server-side, so a
  customer is redirected before they see the console.
- Reads are narrower than writes: customers see their own profile and their own
  ledger, plus the public projection of other profiles (handle, name, avatar).
  Emails and balances of other people are not readable.

## 6. Still to run once the build container is reachable

```bash
npm install          # installs @supabase/supabase-js and @supabase/ssr, regenerates package-lock.json
npx tsc --noEmit     # type checks the integration
```

`package.json` already lists both packages; the lockfile has not been regenerated
because the runtime container was unreachable during the migration.
