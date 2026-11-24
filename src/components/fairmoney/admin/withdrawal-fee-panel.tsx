"use client";
import React from 'react';

import { Check, Coins, Loader2, Save, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateAccountWithdrawalFeeAction } from "@/lib/actions/admin";
import type {
  AccountWithdrawalFee,
  AdminAccountOption,
  AdminActionResult,
  WithdrawalFeeSettings,
} from "@/lib/data/types";
import { formatLongDateTime } from "@/lib/datetime";
import { centsToInput, formatUSD, parseFeeToCents } from "@/lib/money";
import type { FeeApplyScope } from "@/lib/validation";

/**
 * Withdrawal fees — account first.
 *
 * 1. "Withdrawal Fee" (primary) — search for one account, pick it, and set its
 *    fee. FUTURE, PENDING and BOTH all act on that account only.
 * 2. "Default Fee" (secondary, read-only) — the global flat fee Postgres falls
 *    back to for accounts that have no custom fee. It is shown for context; it
 *    is not the fee-management interface.
 *
 * The fee is a flat amount, never a percentage, and it is informational on the
 * customer side: a withdrawal debits exactly what was requested and the fee is
 * recorded beside it. Amounts typed here are converted to integer cents before
 * they reach Postgres, and `request_withdrawal` re-reads the stored fee when a
 * request is created, so nothing the browser sends can decide a fee.
 */

const SCOPES: Array<{ id: FeeApplyScope; label: string; hint: string }> = [
  {
    id: "FUTURE",
    label: "Future",
    hint: "This account's new requests get the new fee. Its pending requests keep theirs.",
  },
  {
    id: "PENDING",
    label: "Pending",
    hint: "Updates this account's requests already waiting for review. Settled requests are untouched.",
  },
  {
    id: "BOTH",
    label: "Both",
    hint: "Updates this account's pending requests and applies the new fee to its future requests.",
  },
];

export function WithdrawalFeePanel({
  settings,
  accounts,
  query,
  selectedAccount,
  accountFee,
}: {
  settings: WithdrawalFeeSettings | null;
  accounts: AdminAccountOption[];
  query: string;
  selectedAccount: AdminAccountOption | null;
  accountFee: AccountWithdrawalFee | null;
}) {
  return (
    <>
      <AccountFeeCard
        accounts={accounts}
        query={query}
        selectedAccount={selectedAccount}
        accountFee={accountFee}
      />
      <GlobalDefaultCard settings={settings} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The amount / reason / scope editor for one account.
 *
 * `baseline` is what Postgres currently resolves for that account; the form is
 * "dirty" when the input differs from it, or when a scope other than Future is
 * chosen (changing the scope alone is a real change — it rewrites pending rows).
 */
function FeeEditorForm({
  baseline,
  initialAmount,
  initialReason,
  onSave,
}: {
  baseline: { feeCents: number; reason: string } | null;
  initialAmount: string;
  initialReason: string;
  onSave: (input: {
    feeCents: number;
    feeReason: string;
    applyTo: FeeApplyScope;
  }) => Promise<AdminActionResult>;
}) {
  const router = useRouter();

  const [amount, setAmount] = useState(initialAmount || "0.00");
  const [reason, setReason] = useState(initialReason);
  const [applyTo, setApplyTo] = useState<FeeApplyScope>("FUTURE");
  const [busy, setBusy] = useState(false);

  const feeCents = parseFeeToCents(amount);
  const reasonTooShort = (feeCents ?? 0) > 0 && reason.trim().length < 3;
  const valid = feeCents !== null && !reasonTooShort && !busy;

  const dirty =
    !baseline ||
    feeCents !== baseline.feeCents ||
    reason.trim() !== baseline.reason.trim() ||
    applyTo !== "FUTURE";

  async function save() {
    if (!valid || feeCents === null) {
      toast.error(
        reasonTooShort
          ? "Add a short reason customers will see for this fee."
          : "Enter a fee amount of $0.00 or more.",
      );
      return;
    }

    setBusy(true);
    const result = await onSave({ feeCents, feeReason: reason, applyTo });
    setBusy(false);

    if (result.ok) {
      toast.success(result.message);
      // The scope has been applied, so the form returns to its resting state and
      // the saved reason is shown exactly as the database stored it.
      setApplyTo("FUTURE");
      setReason((current) => current.trim());
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Fee amount (USD)
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^\d.]/g, "").slice(0, 12))
            }
            placeholder="500.00"
            className="fm-numeric mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-fm-green-bright/50"
          />
          <span className="mt-1.5 block font-mono text-[10.5px] text-white/35">
            {feeCents === null ? "Enter an amount" : `= ${feeCents.toLocaleString("en-US")} cents`}
          </span>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Fee reason
          </span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 120))}
            placeholder="Withdrawal processing fee"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-fm-green-bright/50"
          />
          <span className="mt-1.5 block font-mono text-[10.5px] text-white/35">
            shown to the customer with the request
          </span>
        </label>
      </div>

      <div className="mt-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
          Apply changes to
        </span>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {SCOPES.map((scope) => {
            const active = scope.id === applyTo;
            return (
              <button
                key={scope.id}
                type="button"
                onClick={() => setApplyTo(scope.id)}
                aria-pressed={active}
                className={`rounded-xl px-3 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? "bg-fm-lime text-fm-ink"
                    : "border border-white/10 text-white/60 hover:bg-white/8"
                }`}
              >
                {scope.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-white/45">
          {SCOPES.find((scope) => scope.id === applyTo)?.hint}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!valid || (!dirty && Boolean(baseline))}
          className="inline-flex items-center gap-2 rounded-full bg-fm-lime px-4 py-2.5 font-display text-[12.5px] font-semibold text-fm-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save changes
        </button>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/35">
          {feeCents === null
            ? "invalid amount"
            : reasonTooShort
              ? "reason required"
              : !baseline
                ? "saves the first fee"
                : dirty
                  ? "unsaved changes"
                  : "no changes to save"}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Primary: per-account override                                              */
/* -------------------------------------------------------------------------- */

function accountHref(id: string, query: string): string {
  const params = new URLSearchParams({ tab: "withdrawals", account: id });
  const term = query.trim();
  if (term) params.set("q", term);
  return `/admin?${params.toString()}`;
}

function AccountFeeCard({
  accounts,
  query,
  selectedAccount,
  accountFee,
}: {
  accounts: AdminAccountOption[];
  query: string;
  selectedAccount: AdminAccountOption | null;
  accountFee: AccountWithdrawalFee | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
          <UserRound className="h-4 w-4 text-amber-300" />
          Withdrawal Fee
        </h2>
        <span className="ml-auto rounded-full border border-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
          per account · replaces that account&apos;s fee
        </span>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Search and current state */}
        <div>
          <form action="/admin" className="flex items-center gap-2">
            <input type="hidden" name="tab" value="withdrawals" />
            {selectedAccount ? (
              <input type="hidden" name="account" value={selectedAccount.id} />
            ) : null}
            <label className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-white/35" />
              <input
                name="q"
                defaultValue={query}
                placeholder="Search handle, name or email"
                className="w-full bg-transparent font-mono text-[11.5px] text-white outline-none placeholder:text-white/30"
              />
            </label>
            <button
              type="submit"
              className="rounded-xl border border-white/12 px-3.5 py-2.5 font-display text-[12.5px] font-semibold text-white/85 transition-colors hover:bg-white/8"
            >
              Search
            </button>
          </form>

          <ul className="mt-3 space-y-1.5">
            {accounts.map((account) => {
              const active = account.id === selectedAccount?.id;
              return (
                <li key={account.id}>
                  <Link
                    href={accountHref(account.id, query)}
                    className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                      active
                        ? "border-fm-lime/40 bg-fm-lime/10"
                        : "border-white/8 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-white">
                        {account.displayName}
                        {account.isAdmin ? (
                          <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-fm-lime">
                            admin
                          </span>
                        ) : null}
                      </span>
                      <span className="fm-numeric block truncate font-mono text-[10.5px] text-white/45">
                        @{account.username} · {account.email}
                      </span>
                    </span>
                    {active ? <Check className="h-3.5 w-3.5 shrink-0 text-fm-lime" /> : null}
                  </Link>
                </li>
              );
            })}
            {accounts.length === 0 ? (
              <li className="rounded-xl border border-white/8 px-3.5 py-3 text-[12px] text-white/45">
                No accounts match that search.
              </li>
            ) : null}
          </ul>

          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              {selectedAccount ? `Effective fee for @${selectedAccount.username}` : "Selected account"}
            </p>

            {!selectedAccount ? (
              <p className="mt-3 text-[12.5px] leading-relaxed text-white/50">
                Search for an account above and pick it to see and change its fee. Nothing is
                changed until you save.
              </p>
            ) : accountFee ? (
              <>
                <p className="fm-numeric mt-2.5 font-display text-[26px] font-semibold leading-none text-white">
                  {accountFee.feeCents > 0 ? formatUSD(accountFee.feeCents) : "No fee"}
                </p>
                <p className="mt-2 text-[11.5px] leading-relaxed text-white/45">
                  {accountFee.isCustom
                    ? "This account has its own fee, which replaces the global default."
                    : accountFee.defaultFeeCents !== null
                      ? `No custom fee — this account uses the global default of ${formatUSD(
                          accountFee.defaultFeeCents,
                        )}.`
                      : "No custom fee — this account uses the global default fee."}
                </p>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/55">
                  {accountFee.feeCents > 0
                    ? accountFee.feeReason ||
                      (accountFee.isCustom
                        ? "No reason recorded for this account's fee."
                        : "No reason recorded for the global fee.")
                    : "Requests from this account are recorded with no fee."}
                </p>
                <p className="mt-4 border-t border-white/8 pt-3 text-[11.5px] leading-relaxed text-white/40">
                  {accountFee.updatedAt ? (
                    <>
                      Last updated {formatLongDateTime(accountFee.updatedAt)}
                      {accountFee.updatedByUsername
                        ? ` by @${accountFee.updatedByUsername.replace(/^@+/, "")}`
                        : ""}
                      .
                    </>
                  ) : (
                    "No update has been recorded for this account yet."
                  )}
                  {accountFee.pendingCount !== null
                    ? ` ${accountFee.pendingCount} pending request${
                        accountFee.pendingCount === 1 ? "" : "s"
                      } currently carry this fee.`
                    : ""}
                </p>
              </>
            ) : (
              <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-[12px] leading-relaxed text-amber-100">
                This account&apos;s fee could not be read. Confirm{" "}
                <span className="font-mono">public.admin_get_account_withdrawal_fee()</span> exists
                for this database. Nothing has been changed.
              </p>
            )}

            <p className="mt-3 text-[11.5px] leading-relaxed text-white/35">
              Only this account is affected. Completed and declined withdrawals never change, and
              the fee is never debited from a wallet — a declined request refunds exactly the
              requested amount.
            </p>
          </div>
        </div>

        {/* Editor, remounted per account so the inputs start from that account's fee */}
        <div>
          {selectedAccount ? (
            <FeeEditorForm
              key={selectedAccount.id}
              baseline={
                accountFee
                  ? { feeCents: accountFee.feeCents, reason: accountFee.feeReason }
                  : null
              }
              initialAmount={accountFee ? centsToInput(accountFee.feeCents) : "0.00"}
              initialReason={accountFee?.feeReason ?? ""}
              onSave={(input) =>
                updateAccountWithdrawalFeeAction({ ...input, userId: selectedAccount.id })
              }
            />
          ) : (
            <div className="flex h-full items-center rounded-2xl border border-dashed border-white/10 px-5 py-6 text-[12.5px] leading-relaxed text-white/40">
              Pick an account to edit its fee. Future replaces that account&apos;s custom fee,
              Pending updates only its pending requests, and Both does both.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Secondary: global default, read-only                                       */
/* -------------------------------------------------------------------------- */

function GlobalDefaultCard({ settings }: { settings: WithdrawalFeeSettings | null }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-white/80">
          <Coins className="h-4 w-4 text-white/40" />
          Default Fee
        </h2>
        <span className="ml-auto rounded-full border border-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
          fallback · read only
        </span>
      </div>

      <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Global default
          </p>

          {settings ? (
            <>
              <p className="fm-numeric mt-2.5 font-display text-[22px] font-semibold leading-none text-white/85">
                {settings.feeCents > 0 ? formatUSD(settings.feeCents) : "No fee"}
              </p>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/55">
                {settings.feeCents > 0
                  ? settings.feeReason || "No reason recorded for this fee yet."
                  : "Accounts without their own fee are charged no withdrawal fee."}
              </p>
              <p className="mt-4 border-t border-white/8 pt-3 text-[11.5px] leading-relaxed text-white/40">
                {settings.updatedAt ? (
                  <>
                    Last updated {formatLongDateTime(settings.updatedAt)}
                    {settings.updatedByUsername
                      ? ` by @${settings.updatedByUsername.replace(/^@+/, "")}`
                      : ""}
                    .
                  </>
                ) : (
                  "No update has been recorded for this fee yet."
                )}
              </p>
            </>
          ) : (
            <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-[12px] leading-relaxed text-amber-100">
              The default fee could not be read. Confirm the migration created{" "}
              <span className="font-mono">public.withdrawal_fee_settings</span> and{" "}
              <span className="font-mono">public.admin_get_withdrawal_fee()</span> for this database.
              Nothing has been changed.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            How this is used
          </p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/55">
            This figure applies only to accounts that have no fee of their own. A fee saved on an
            account above replaces it for that account, so every fee change is made per account
            rather than here.
          </p>
          <p className="mt-3 text-[11.5px] leading-relaxed text-white/35">
            The fee is recorded with each request and never debited from a wallet. Rejecting a
            request refunds exactly the requested amount.
          </p>
        </div>
      </div>
    </div>
  );
}
