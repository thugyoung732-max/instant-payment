"use client";
import React from 'react';

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, Clock, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AnimatedAmount } from "@/components/fairmoney/animated-amount";
import { Magnetic } from "@/components/fairmoney/magnetic";
import { DESTINATION_GROUPS, WITHDRAWAL_DESTINATIONS, findDestination } from "@/lib/destinations";
import type { WithdrawalFeeSettings } from "@/lib/data/types";
import { formatUSD, parseAmountToCents } from "@/lib/money";
import { withdrawAction } from "@/lib/actions/wallet";

type Submitted = {
  reference: string;
  amountCents: number;
  feeCents: number;
  feeReason: string | null;
  totalCents: number;
  destination: string;
  balanceAfterCents: number;
  createdAt: string;
};

// The withdrawal fee is informational only. A $10,000 request with a $500 fee
// debits exactly $10,000 — never $10,500, and the request is never reduced to
// $9,500. The fee is recorded against the request for the customer's records.

const fieldClass =
  "mt-3.5 w-full rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 text-[16px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/45 focus:bg-card";

export function WithdrawForm({
  balanceCents,
  fee = null,
}: {
  balanceCents: number;
  fee?: WithdrawalFeeSettings | null;
}) {
  const [amount, setAmount] = useState("");
  const [destinationId, setDestinationId] = useState<string>(WITHDRAWAL_DESTINATIONS[0].id);
  const [accountName, setAccountName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);

  const destination = findDestination(destinationId) ?? WITHDRAWAL_DESTINATIONS[0];
  const amountCents = parseAmountToCents(amount);

  // Read from the stored settings row on the server. Nothing here is submitted:
  // the database looks the fee up itself when the request is created, so this is
  // disclosure, not calculation.
  const feeKnown = fee !== null;
  const feeCents = fee?.feeCents ?? 0;
  const feeReason = fee?.feeReason ?? "";

  // "Total withdrawal request" is the requested amount. The fee is recorded
  // beside it and never added to (or subtracted from) the wallet movement.
  const totalCents = amountCents ?? 0;
  const overdraft = amountCents !== null && amountCents > balanceCents;
  const canSubmit =
    Boolean(amountCents) &&
    !overdraft &&
    accountName.trim().length >= 2 &&
    identifier.trim().length >= 3 &&
    !busy;

  async function submit() {
    if (!canSubmit || !amountCents) return;
    setBusy(true);
    setError(null);

    const result = await withdrawAction({
      amountCents,
      destinationId,
      accountName,
      identifier,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }

    setSubmitted({
      reference: result.reference,
      amountCents: result.amountCents,
      feeCents: result.feeCents,
      feeReason: result.feeReason ?? (feeReason || null),
      totalCents: result.totalCents,
      destination: result.destination,
      balanceAfterCents: result.balanceAfterCents,
      createdAt: result.createdAt,
    });
    toast.success("Withdrawal submitted — pending approval");
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 18, mass: 0.4 }}
          className="fm-card fm-card-ink relative isolate overflow-hidden px-6 py-7 text-white"
        >
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(80% 60% at 86% 0%, rgba(245,158,11,0.26), transparent 60%), radial-gradient(60% 50% at 0% 100%, rgba(22,199,139,0.2), transparent 65%)",
            }}
          />
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 14, mass: 0.5, delay: 0.06 }}
            className="grid h-14 w-14 place-items-center rounded-full bg-amber-300 text-fm-ink"
          >
            <Clock className="h-6 w-6" strokeWidth={2.3} />
          </motion.span>

          <p className="fm-label mt-6 text-white/55">Withdrawal submitted</p>
          <p className="fm-numeric mt-3 font-display text-[40px] font-semibold leading-none tracking-[-0.03em]">
            {formatUSD(submitted.amountCents)}
          </p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/12 px-3.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-amber-200">
            <Clock className="h-3.5 w-3.5" />
            Pending approval
          </span>

          <dl className="mt-6 space-y-3 text-[12.5px] text-white/60">
            <div className="flex items-start justify-between gap-4">
              <dt>Transaction ID</dt>
              <dd className="fm-numeric font-mono text-white/85">{submitted.reference}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt>Destination</dt>
              <dd className="max-w-[62%] text-right text-white/85">{submitted.destination}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt>Withdrawal fee</dt>
              <dd className="fm-numeric text-white/85">
                {submitted.feeCents > 0 ? formatUSD(submitted.feeCents) : "No fee"}
              </dd>
            </div>
            {submitted.feeReason ? (
              <div className="flex items-start justify-between gap-4">
                <dt>Fee reason</dt>
                <dd className="max-w-[62%] text-right text-white/85">{submitted.feeReason}</dd>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              <dt>Total withdrawal request</dt>
              <dd className="fm-numeric text-white/85">{formatUSD(submitted.totalCents)}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt>Status</dt>
              <dd className="text-white/85">Pending approval</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt>Requested</dt>
              <dd className="fm-numeric text-white/85">
                {new Date(submitted.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC
              </dd>
            </div>
          </dl>

          <div className="mt-6 rounded-[22px] bg-white/8 px-5 py-4">
            <p className="fm-label text-white/50">Available balance</p>
            <AnimatedAmount
              cents={submitted.balanceAfterCents}
              className="mt-2 block font-display text-[26px] font-semibold"
            />
          </div>

          <p className="mt-6 text-[12.5px] leading-relaxed text-white/55">
            We&apos;ll email you once this withdrawal has been reviewed. Requests are usually settled
            within 1–2 business days.
          </p>
        </motion.section>

        <button
          type="button"
          onClick={() => {
            setSubmitted(null);
            setAmount("");
            setAccountName("");
            setIdentifier("");
          }}
          className="fm-btn fm-btn-ghost w-full"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="fm-card px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="fm-label">Withdrawal fee</p>
          <p className="fm-numeric font-display text-[17px] font-semibold text-foreground">
            {feeKnown ? (feeCents > 0 ? formatUSD(feeCents) : "No fee") : "—"}
          </p>
        </div>

        {feeKnown && feeCents > 0 ? (
          <>
            {feeReason ? (
              <p className="mt-2 text-[12.5px] leading-relaxed text-foreground">{feeReason}</p>
            ) : null}
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              A flat fee, recorded with the request. It is never deducted from your wallet — you are
              debited only the amount you ask for, and the request stays pending until it is
              approved.
            </p>
          </>
        ) : feeKnown ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            No withdrawal fee is currently charged. Requests are still reviewed before payout.
          </p>
        ) : (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            Fee details could not be loaded right now. The exact fee, if any, appears on your
            confirmation once you submit.
          </p>
        )}
      </section>

      <section className="fm-card px-6 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <label htmlFor="withdraw-amount" className="fm-label">
            Amount
          </label>
          <span className="fm-numeric text-[12.5px] text-muted-foreground">
            Available {formatUSD(balanceCents)}
          </span>
        </div>

        <div className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 transition-colors focus-within:border-primary/45 focus-within:bg-card">
          <span className="font-display text-[26px] font-semibold text-muted-foreground">$</span>
          <input
            id="withdraw-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            className="fm-numeric min-w-0 flex-1 bg-transparent font-display text-[26px] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/45"
          />
          <button
            type="button"
            onClick={() => setAmount((balanceCents / 100).toFixed(2))}
            className="shrink-0 rounded-full border border-fm-ink/15 bg-fm-ink px-3.5 py-2 font-display text-[12.5px] font-semibold text-fm-lime"
          >
            Max
          </button>
        </div>

        {amountCents ? (
          <dl className="mt-5 space-y-2.5 rounded-[20px] border border-border bg-secondary/40 px-4 py-4 text-[13px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Withdrawal amount</dt>
              <dd className="fm-numeric text-foreground">{formatUSD(amountCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Withdrawal fee</dt>
              <dd className="fm-numeric text-foreground">
                {feeKnown ? (feeCents > 0 ? formatUSD(feeCents) : "No fee") : "—"}
              </dd>
            </div>
            {feeReason ? (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Fee reason</dt>
                <dd className="max-w-[62%] text-right text-foreground">{feeReason}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-2.5">
              <dt className="font-semibold text-foreground">Total withdrawal request</dt>
              <dd className="fm-numeric font-display text-[15px] font-semibold text-foreground">
                {formatUSD(totalCents)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber-600">
                Pending approval
              </dd>
            </div>
          </dl>
        ) : null}

        {overdraft ? (
          <p className="mt-3.5 flex items-center gap-2 text-[12.5px] text-destructive">
            <CircleAlert className="h-4 w-4" />
            That is more than your available balance.
          </p>
        ) : null}
      </section>

      <section className="fm-card px-6 py-6">
        <label htmlFor="withdraw-destination" className="fm-label">
          Withdraw to
        </label>
        <select
          id="withdraw-destination"
          value={destinationId}
          onChange={(event) => setDestinationId(event.target.value)}
          className={`fm-field ${fieldClass.replace("mt-3.5 ", "")}`}
        >
          {DESTINATION_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {WITHDRAWAL_DESTINATIONS.filter((item) => item.group === group).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <label htmlFor="account-name" className="fm-label mt-6 block">
          Name on account
        </label>
        <input
          id="account-name"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value.slice(0, 60))}
          placeholder="Full name on the account"
          className={fieldClass}
        />

        <label htmlFor="identifier" className="fm-label mt-6 block">
          {destination.identifierLabel}
        </label>
        <input
          id="identifier"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value.slice(0, 64))}
          placeholder={destination.identifierPlaceholder}
          className={`${fieldClass} ${destination.needsAccountNumber ? "fm-numeric" : ""}`}
        />
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          {destination.needsAccountNumber
            ? "Only the last 4 digits of the account number are stored with the request."
            : "We only store a masked version of the details you enter."}
        </p>
      </section>

      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fm-notice border border-destructive/25 bg-destructive/8 text-destructive"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Magnetic className="w-full" strength={0.16}>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="fm-btn fm-btn-primary w-full"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting
            </>
          ) : (
            <>
              <Landmark className="h-4 w-4" />
              Confirm withdrawal
            </>
          )}
        </button>
      </Magnetic>

      <p className="flex items-start justify-center gap-2.5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Only the amount you request is held from your balance while it is reviewed. Any withdrawal
        fee is recorded with the request and never taken out of your wallet.
      </p>
    </div>
  );
}
