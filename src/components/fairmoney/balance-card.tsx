import React from 'react';

import { ArrowDownLeft, ArrowUpRight, Landmark, Plus, Send } from "lucide-react";
import Link from "next/link";

import { AnimatedAmount } from "@/components/fairmoney/animated-amount";
import { Magnetic } from "@/components/fairmoney/magnetic";
import { formatUSD } from "@/lib/money";

type BalanceCardProps = {
  balanceCents: number;
  username: string;
  moneyInCents: number;
  moneyOutCents: number;
  pendingWithdrawalCents?: number;
  pendingWithdrawalCount?: number;
};

/** Wallet hero: available balance, the three primary actions and lifetime totals. */
export function BalanceCard({
  balanceCents,
  moneyInCents,
  moneyOutCents,
  pendingWithdrawalCents = 0,
  pendingWithdrawalCount = 0,
}: BalanceCardProps) {
  return (
    <section className="fm-card fm-card-ink relative isolate overflow-hidden px-6 py-7 text-white">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(95% 70% at 88% 0%, rgba(22,199,139,0.32), transparent 62%), radial-gradient(75% 60% at 4% 100%, rgba(200,242,74,0.14), transparent 66%)",
        }}
      />
      <div aria-hidden className="fm-grain absolute inset-0 -z-10 opacity-25" />

      <p className="fm-label text-white/55">Available balance</p>
      <AnimatedAmount
        cents={balanceCents}
        className="mt-3 block font-display text-[48px] font-semibold leading-none tracking-[-0.03em]"
      />

      {pendingWithdrawalCents > 0 ? (
        <p className="fm-numeric mt-3.5 text-[13px] leading-relaxed text-amber-200/90">
          {formatUSD(pendingWithdrawalCents)} on hold · {pendingWithdrawalCount} withdrawal
          {pendingWithdrawalCount === 1 ? "" : "s"} processing
        </p>
      ) : null}

      <div className="my-7 h-px w-full bg-white/12" />

      <div className="grid grid-cols-3 gap-3">
        <Magnetic className="w-full" strength={0.14}>
          <Link href="/app/send" className="fm-btn fm-btn-accent w-full px-2">
            <Send className="h-4 w-4" strokeWidth={2.4} />
            Send
          </Link>
        </Magnetic>
        <Magnetic className="w-full" strength={0.14}>
          <Link
            href="/app/deposit"
            className="fm-btn w-full border border-white/15 bg-white/8 px-2 text-white hover:bg-white/15"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            Deposit
          </Link>
        </Magnetic>
        <Magnetic className="w-full" strength={0.14}>
          <Link
            href="/app/withdraw"
            className="fm-btn w-full border border-white/15 bg-white/8 px-2 text-white hover:bg-white/15"
          >
            <Landmark className="h-4 w-4" strokeWidth={2.2} />
            Withdraw
          </Link>
        </Magnetic>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-5 border-t border-white/10 pt-6">
        <div>
          <dt className="flex items-center gap-2 text-[12.5px] text-white/55">
            <ArrowDownLeft className="h-4 w-4" />
            Total in
          </dt>
          <dd className="fm-numeric mt-2 font-display text-[17px] font-semibold text-white">
            {formatUSD(moneyInCents)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-[12.5px] text-white/55">
            <ArrowUpRight className="h-4 w-4" />
            Total out
          </dt>
          <dd className="fm-numeric mt-2 font-display text-[17px] font-semibold text-white">
            {formatUSD(moneyOutCents)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
