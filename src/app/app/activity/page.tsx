import React from 'react';

import Link from "next/link";

import { TransactionList } from "@/components/fairmoney/transaction-list";
import { requireUser } from "@/lib/auth";
import { formatUSD } from "@/lib/money";
import { getActivity, getWalletSummary, type ActivityFilter } from "@/lib/queries";

export const metadata = { title: "Activity — INSTANT PAYMENT" };

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "transfers", label: "Transfers" },
  { id: "deposits", label: "Deposits" },
  { id: "withdrawals", label: "Withdrawals" },
];

function isFilter(value: string | undefined): value is ActivityFilter {
  return value === "all" || value === "transfers" || value === "deposits" || value === "withdrawals";
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filter: ActivityFilter = isFilter(params.type) ? params.type : "all";

  const [activity, summary] = await Promise.all([
    getActivity(user.id, { limit: 60, filter }),
    getWalletSummary(user.id, user.balanceCents),
  ]);

  return (
    <div className="space-y-8">
      <header className="fm-rise">
        <p className="fm-label">Transactions</p>
        <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          Activity
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          Every movement carries its own transaction ID, status and the balance it produced. Times
          are UTC.
        </p>
      </header>

      <section className="fm-card grid grid-cols-3 divide-x divide-border/70">
        <Total label="In" value={formatUSD(summary.moneyInCents)} tone="in" />
        <Total label="Out" value={formatUSD(summary.moneyOutCents)} tone="out" />
        <Total label="Processing" value={formatUSD(summary.pendingWithdrawalCents)} tone="warn" />
      </section>

      <div className="flex flex-wrap gap-2.5">
        {FILTERS.map((item) => {
          const active = item.id === filter;
          return (
            <Link
              key={item.id}
              href={item.id === "all" ? "/app/activity" : `/app/activity?type=${item.id}`}
              className={
                active ? "fm-chip border-transparent bg-fm-ink text-white hover:bg-fm-ink" : "fm-chip"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <section className="fm-card pb-3 pt-6">
        <div className="px-6">
          <h2 className="font-display text-[16px] font-semibold text-foreground">
            {filter === "all" ? "All transactions" : FILTERS.find((f) => f.id === filter)?.label}
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {activity.length} record{activity.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="mt-3">
          <TransactionList items={activity} showBalance />
        </div>
      </section>
    </div>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "in" | "out" | "warn";
}) {
  const toneClass =
    tone === "in" ? "text-primary" : tone === "warn" ? "text-amber-600" : "text-foreground";

  return (
    <div className="px-5 py-6">
      <p className="fm-label">{label}</p>
      <p
        className={`fm-numeric mt-3 font-display text-[18px] font-semibold leading-none ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}
