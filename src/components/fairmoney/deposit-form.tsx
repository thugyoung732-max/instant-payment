"use client";
import React from 'react';

import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CircleAlert, Loader2, Plus, Receipt, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AnimatedAmount } from "@/components/fairmoney/animated-amount";
import { Magnetic } from "@/components/fairmoney/magnetic";
import { formatUSD, parseAmountToCents } from "@/lib/money";
import { depositAction } from "@/server/actions/wallet";

type ReceiptData = {
  reference: string;
  creditedCents: number;
  declaredCents: number | null;
  balanceAfterCents: number;
  code: string;
  codeLabel: string | null;
};

const QUICK_AMOUNTS = [2500, 5000, 10000, 25000];

export function DepositForm({ balanceCents }: { balanceCents: number }) {
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const amountCents = parseAmountToCents(amount);
  const canSubmit = code.trim().length >= 4 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const result = await depositAction({ code, amountCents: amountCents ?? undefined });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }

    setReceipt({
      reference: result.reference,
      creditedCents: result.creditedCents,
      declaredCents: result.declaredCents,
      balanceAfterCents: result.balanceAfterCents,
      code: result.code,
      codeLabel: result.codeLabel,
    });
    toast.success(`Deposit completed — ${formatUSD(result.creditedCents)} added`);
  }

  if (receipt) {
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
                "radial-gradient(80% 60% at 86% 0%, rgba(22,199,139,0.36), transparent 60%), radial-gradient(60% 50% at 0% 100%, rgba(200,242,74,0.18), transparent 65%)",
            }}
          />
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 14, mass: 0.5, delay: 0.06 }}
            className="grid h-14 w-14 place-items-center rounded-full bg-fm-lime text-fm-ink"
          >
            <BadgeCheck className="h-6 w-6" strokeWidth={2.3} />
          </motion.span>

          <p className="fm-label mt-6 text-white/55">Deposit completed</p>
          <p className="fm-numeric mt-3 font-display text-[40px] font-semibold leading-none tracking-[-0.03em]">
            {formatUSD(receipt.creditedCents)}
          </p>
          <p className="mt-3.5 text-[14px] leading-relaxed text-white/75">
            added with code <span className="fm-numeric font-mono text-white">{receipt.code}</span>
            {receipt.codeLabel ? ` · ${receipt.codeLabel}` : ""}
          </p>

          {receipt.declaredCents && receipt.declaredCents !== receipt.creditedCents ? (
            <p className="fm-notice mt-5 border border-amber-300/25 bg-amber-300/10 text-[12.5px] text-amber-100">
              You entered {formatUSD(receipt.declaredCents)}. Code {receipt.code} credits{" "}
              {formatUSD(receipt.creditedCents)}, which is what was added.
            </p>
          ) : null}

          <div className="mt-6 rounded-[22px] bg-white/8 px-5 py-4">
            <p className="fm-label text-white/50">New available balance</p>
            <AnimatedAmount
              cents={receipt.balanceAfterCents}
              className="mt-2 block font-display text-[26px] font-semibold"
            />
          </div>

          <dl className="mt-6 space-y-3 text-[12.5px] text-white/60">
            <div className="flex items-center justify-between gap-4">
              <dt>Transaction ID</dt>
              <dd className="fm-numeric font-mono text-white/85">{receipt.reference}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Status</dt>
              <dd className="font-mono uppercase tracking-[0.12em] text-fm-lime">completed</dd>
            </div>
          </dl>
        </motion.section>

        <button
          type="button"
          onClick={() => {
            setReceipt(null);
            setAmount("");
            setCode("");
          }}
          className="fm-btn fm-btn-ghost w-full"
        >
          Make another deposit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="fm-card px-6 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <label htmlFor="deposit-amount" className="fm-label">
            Deposit amount
          </label>
          <span className="fm-numeric text-[12.5px] text-muted-foreground">
            Available {formatUSD(balanceCents)}
          </span>
        </div>

        <div className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 transition-colors focus-within:border-primary/45 focus-within:bg-white">
          <span className="font-display text-[26px] font-semibold text-muted-foreground">$</span>
          <input
            id="deposit-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            className="fm-numeric min-w-0 flex-1 bg-transparent font-display text-[26px] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/45"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {QUICK_AMOUNTS.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => setAmount((cents / 100).toFixed(2))}
              className="fm-chip"
            >
              {formatUSD(cents)}
            </button>
          ))}
        </div>

        <label htmlFor="deposit-code" className="fm-label mt-7 block">
          Deposit code
        </label>
        <input
          id="deposit-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 32))}
          placeholder="ABC123"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="fm-field fm-field-code mt-3.5"
        />
        <p className="mt-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
          Your deposit code is issued with your account. The amount a code is worth is fixed when it
          is issued and is applied by our system.
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
              Verifying code
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Deposit
            </>
          )}
        </button>
      </Magnetic>

      <p className="flex items-center justify-center gap-2.5 text-center text-[12.5px] text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        Codes are verified on our servers before any balance changes.
      </p>
    </div>
  );
}

export function DepositHistoryHint() {
  return (
    <p className="fm-notice border border-border bg-white/70 text-muted-foreground">
      <Receipt className="mt-0.5 h-4 w-4 shrink-0" />
      Every completed deposit appears in Activity with its own transaction ID and status.
    </p>
  );
}
