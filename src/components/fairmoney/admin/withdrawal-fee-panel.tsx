"use client";
import React from 'react';

import { Coins, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateWithdrawalFeeAction } from "@/lib/actions/admin";
import type { FeeApplyScope } from "@/lib/validation";
import type { WithdrawalFeeSettings } from "@/lib/data/types";
import { formatLongDateTime } from "@/lib/datetime";
import { centsToInput, formatUSD, parseFeeToCents } from "@/lib/money";

/**
 * "Withdrawal Fee Settings" — the one place the flat payout fee is configured.
 *
 * The fee is a flat amount, never a percentage, and it is informational on the
 * customer side: a withdrawal debits exactly what was requested and the fee is
 * recorded beside it. The amount typed here is converted to integer cents before
 * it reaches `admin_update_withdrawal_fee`, and the database re-reads it when a
 * request is created, so nothing the browser sends can decide a fee.
 */

const SCOPES: Array<{ id: FeeApplyScope; label: string; hint: string }> = [
  {
    id: "FUTURE",
    label: "Future",
    hint: "New requests get the new fee. Existing pending requests keep theirs.",
  },
  {
    id: "PENDING",
    label: "Pending",
    hint: "Updates requests already waiting for review. Settled requests are untouched.",
  },
  {
    id: "BOTH",
    label: "Both",
    hint: "Updates pending requests and applies the new fee to future requests.",
  },
];

export function WithdrawalFeePanel({ settings }: { settings: WithdrawalFeeSettings | null }) {
  const router = useRouter();

  const [amount, setAmount] = useState(settings ? centsToInput(settings.feeCents) : "0.00");
  const [reason, setReason] = useState(settings?.feeReason ?? "");
  const [applyTo, setApplyTo] = useState<FeeApplyScope>("FUTURE");
  const [busy, setBusy] = useState(false);

  const feeCents = parseFeeToCents(amount);
  const reasonTooShort = (feeCents ?? 0) > 0 && reason.trim().length < 3;
  const valid = feeCents !== null && !reasonTooShort && !busy;

  const dirty =
    !settings ||
    feeCents !== settings.feeCents ||
    reason.trim() !== settings.feeReason.trim() ||
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
    const result = await updateWithdrawalFeeAction({ feeCents, feeReason: reason, applyTo });
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
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
          <Coins className="h-4 w-4 text-amber-300" />
          Withdrawal Fee Settings
        </h2>
        <span className="ml-auto rounded-full border border-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
          flat fee · not a percentage
        </span>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Current active fee */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Current active fee
          </p>

          {settings ? (
            <>
              <p className="fm-numeric mt-2.5 font-display text-[26px] font-semibold leading-none text-white">
                {settings.feeCents > 0 ? formatUSD(settings.feeCents) : "No fee"}
              </p>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/55">
                {settings.feeCents > 0
                  ? settings.feeReason || "No reason recorded for this fee yet."
                  : "Customers are currently charged no withdrawal fee."}
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
              The fee settings could not be read. Confirm the migration created{" "}
              <span className="font-mono">public.withdrawal_fee_settings</span> and{" "}
              <span className="font-mono">public.admin_get_withdrawal_fee()</span> for this database.
              Nothing has been changed.
            </p>
          )}

          <p className="mt-3 text-[11.5px] leading-relaxed text-white/35">
            A fee is recorded with each request and is never debited from a wallet. Rejecting a
            request refunds exactly the requested amount.
          </p>
        </div>

        {/* Editor */}
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
                Shown to the customer with the request
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
              disabled={!valid || (!dirty && Boolean(settings))}
              className="inline-flex items-center gap-2 rounded-full bg-fm-lime px-4 py-2.5 font-display text-[12.5px] font-semibold text-fm-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save changes
            </button>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/35">
              {feeCents === null
                ? "invalid amount"
                : reasonTooShort
                  ? "reason required"
                  : !settings
                    ? "saves the first fee"
                    : dirty
                      ? "unsaved changes"
                      : "no changes to save"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
