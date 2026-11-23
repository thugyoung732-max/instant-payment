import React from 'react';

import { Clock, LogOut, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";

import { AnimatedAmount } from "@/components/fairmoney/animated-amount";
import { Avatar } from "@/components/fairmoney/avatar";
import { ProfileForm } from "@/components/fairmoney/profile-form";
import { SupportCard } from "@/components/fairmoney/support-card";
import { ThemeToggle } from "@/components/fairmoney/theme-toggle";
import { logOutAction } from "@/server/actions/auth";
import { requireUser } from "@/lib/auth";
import { chatConfigFrom, chatIsLive, getChatSettings } from "@/lib/chat";
import { chatProvider } from "@/lib/chat-config";
import { formatLongDateTime } from "@/lib/datetime";
import { formatUSD } from "@/lib/money";
import { getActivity, getWalletSummary } from "@/lib/queries";

export const metadata = { title: "Profile — INSTANT PAYMENT" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [summary, withdrawals, chatSettings] = await Promise.all([
    getWalletSummary(user.id, user.balanceCents),
    getActivity(user.id, { limit: 40, filter: "withdrawals" }),
    getChatSettings(),
  ]);

  const pending = withdrawals.filter((item) => item.status === "PENDING");
  const chatLive = chatIsLive(chatSettings);
  const chatConfig = chatConfigFrom(chatSettings);
  const providerLabel = chatProvider(chatSettings.provider).label;

  return (
    <div className="space-y-8">
      <section className="fm-card overflow-hidden">
        <div className="fm-card-ink px-6 py-7 text-white">
          <div className="flex items-center gap-5">
            <Avatar
              displayName={user.displayName}
              hue={user.avatarHue}
              username={user.username}
              avatarUpdatedAt={user.avatar?.updatedAt ?? null}
              size="xl"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[21px] font-semibold leading-tight">
                {user.displayName}
              </h1>
              <p className="fm-numeric mt-1.5 truncate font-mono text-[13px] text-white/60">
                @{user.username}
              </p>
              {user.isAdmin ? (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-fm-lime/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fm-lime">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  administrator
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-7 border-t border-white/10 pt-6">
            <p className="fm-label text-white/55">Available balance</p>
            <AnimatedAmount
              cents={user.balanceCents}
              className="mt-2.5 block font-display text-[38px] font-semibold leading-none tracking-[-0.03em]"
            />
            {summary.pendingWithdrawalCents > 0 ? (
              <p className="fm-numeric mt-3.5 text-[13px] text-amber-200/90">
                {formatUSD(summary.pendingWithdrawalCents)} on hold ·{" "}
                {summary.pendingWithdrawalCount} processing
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <ProfileForm
        username={user.username}
        displayName={user.displayName}
        avatarHue={user.avatarHue}
        avatarUpdatedAt={user.avatar?.updatedAt ?? null}
      />

      <section className="fm-card px-6 py-6">
        <h2 className="font-display text-[16px] font-semibold text-foreground">Account details</h2>
        <dl className="mt-5 space-y-4">
          <Detail label="Email" value={user.email} mono />
          <Detail label="Member since" value={formatLongDateTime(user.createdAt)} />
          <Detail label="Deposits completed" value={String(summary.depositCount)} />
          <Detail label="Transfers sent" value={String(summary.transferCount)} />
          <Detail label="Failed attempts" value={String(summary.declinedCount)} />
        </dl>
      </section>

      <section className="fm-card px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2.5 font-display text-[16px] font-semibold text-foreground">
            <Clock className="h-4.5 w-4.5 text-amber-600" />
            Withdrawals in review
          </h2>
          <Link
            href="/app/activity?type=withdrawals"
            className="text-[13px] font-semibold text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        {pending.length === 0 ? (
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
            Nothing is waiting on review right now. Payout requests are usually settled within 1–2
            business days.
          </p>
        ) : (
          <ul className="mt-5 space-y-3.5">
            {pending.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-[22px] border border-amber-500/25 bg-amber-50/70 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="fm-numeric font-display text-[15px] font-semibold text-foreground">
                    {formatUSD(item.amountCents)}
                  </p>
                  <p className="fm-numeric mt-1.5 truncate font-mono text-[11px] text-muted-foreground">
                    {item.reference}
                  </p>
                  {item.destination ? (
                    <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
                      {item.destination}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-amber-200/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-900">
                  processing
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fm-card px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-[16px] font-semibold text-foreground">Help &amp; support</h2>
          {chatLive ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700">
              chat online
            </span>
          ) : null}
        </div>
        <div className="mt-5">
          <SupportCard
            live={chatLive}
            config={chatConfig}
            welcomeMessage={chatSettings.welcomeMessage}
            providerLabel={providerLabel}
          />
        </div>
      </section>

      <section className="fm-card px-6 py-6">
        <h2 className="font-display text-[16px] font-semibold text-foreground">Appearance</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Choose how INSTANT PAYMENT looks on this device.
        </p>
        <div className="mt-5">
          <ThemeToggle />
        </div>
      </section>

      <form action={logOutAction}>
        <button type="submit" className="fm-btn fm-btn-ghost w-full text-destructive">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>

      <p className="flex items-center justify-center gap-2.5 px-3 pb-2 text-center text-[12px] leading-relaxed text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" />
        INSTANT PAYMENT · accounts, balances and payouts are managed by our team
      </p>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-5 border-b border-border/70 pb-4 last:border-0 last:pb-0">
      <dt className="text-[13.5px] text-muted-foreground">{label}</dt>
      <dd
        className={`truncate text-right text-[13.5px] text-foreground ${
          mono ? "fm-numeric font-mono text-[12.5px]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
