import React from 'react';

import { Banknote, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/fairmoney/avatar";
import { BalanceCard } from "@/components/fairmoney/balance-card";
import { TransactionList } from "@/components/fairmoney/transaction-list";
import { requireProfile } from "@/lib/auth";
import { getActivity, getRecentContacts, getWalletSummary } from "@/lib/data/queries";
import { formatUSD } from "@/lib/money";

export default async function HomePage() {
  const profile = await requireProfile();

  const [summary, activity, contacts] = await Promise.all([
    getWalletSummary(profile.id),
    getActivity(profile.id, { limit: 4 }),
    getRecentContacts(profile.id, 4),
  ]);

  const firstName = profile.displayName.split(" ")[0];

  return (
    <div className="space-y-8">
      <section className="fm-rise">
        <p className="fm-label">Your wallet</p>
        <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          Good to see you, {firstName}
        </h1>
      </section>

      <BalanceCard
        balanceCents={summary.balanceCents}
        username={profile.username}
        moneyInCents={summary.moneyInCents}
        moneyOutCents={summary.moneyOutCents}
        pendingWithdrawalCents={summary.pendingWithdrawalCents}
        pendingWithdrawalCount={summary.pendingWithdrawalCount}
      />

      {summary.pendingWithdrawalCount > 0 ? (
        <Link
          href="/app/activity?type=withdrawals"
          className="fm-notice items-center border border-amber-500/25 bg-amber-50/80 transition-colors hover:bg-amber-50"
        >
          <Clock className="h-4.5 w-4.5 shrink-0 text-amber-700" />
          <span className="flex-1 text-amber-900">
            {summary.pendingWithdrawalCount} withdrawal
            {summary.pendingWithdrawalCount === 1 ? "" : "s"} processing ·{" "}
            <span className="fm-numeric font-semibold">
              {formatUSD(summary.pendingWithdrawalCents)}
            </span>{" "}
            on hold
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-700" />
        </Link>
      ) : null}

      <section className="fm-card px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-[16px] font-semibold text-foreground">Quick send</h2>
          <Link
            href="/app/send"
            className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
          >
            New transfer
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {contacts.length === 0 ? (
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
            No recent recipients yet. Search any @username on the Send tab and they&apos;ll appear
            here next time.
          </p>
        ) : (
          <ul className="mt-5 flex gap-4 overflow-x-auto pb-1">
            {contacts.map((contact) => (
              <li key={contact.username}>
                <Link
                  href={`/app/send?to=${contact.username}`}
                  className="flex w-[86px] flex-col items-center gap-2.5 rounded-2xl py-1 transition-opacity hover:opacity-80"
                >
                  <Avatar
                    displayName={contact.displayName}
                    hue={contact.avatarHue}
                    username={contact.username}
                    avatarUpdatedAt={contact.avatarUpdatedAt}
                    size="lg"
                  />
                  <span className="w-full truncate text-center text-[12.5px] font-semibold text-foreground">
                    @{contact.username}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fm-card grid grid-cols-3 divide-x divide-border/70">
        <Stat label="Transfers" value={String(summary.transferCount)} hint="sent" />
        <Stat label="Deposits" value={String(summary.depositCount)} hint="completed" />
        <Stat
          label="Pending"
          value={String(summary.pendingWithdrawalCount)}
          hint="withdrawals"
          tone={summary.pendingWithdrawalCount > 0 ? "warn" : "default"}
        />
      </section>

      <section className="fm-card pb-3 pt-6">
        <div className="flex items-center justify-between gap-4 px-6">
          <h2 className="font-display text-[16px] font-semibold text-foreground">
            Recent activity
          </h2>
          <Link
            href="/app/activity"
            className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
          >
            See all
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-3">
          <TransactionList items={activity} />
        </div>
      </section>

      <p className="flex items-start gap-3 px-3 pb-2 text-[12.5px] leading-relaxed text-muted-foreground">
        <Banknote className="mt-0.5 h-4 w-4 shrink-0" />
        Deposits are funded with the codes issued for your account. Withdrawal requests are reviewed
        and usually settled within 1–2 business days.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="px-5 py-6">
      <p className="fm-label">{label}</p>
      <p
        className={`fm-numeric mt-3 font-display text-[22px] font-semibold leading-none ${
          tone === "warn" ? "text-amber-600" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}
