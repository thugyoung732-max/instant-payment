import React from 'react';

import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Clock,
  FlaskConical,
  Landmark,
  Lock,
  Receipt,
  Send,
  ShieldCheck,
  UserCircle2,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { AnimatedAmount } from "@/components/fairmoney/animated-amount";
import { Avatar } from "@/components/fairmoney/avatar";
import { BrandMark } from "@/components/fairmoney/brand";
import { Magnetic } from "@/components/fairmoney/magnetic";
import { Reveal, RevealGroup, RevealItem } from "@/components/fairmoney/reveal";
import { getCurrentUser } from "@/lib/auth";

export default async function LandingPage() {
  const user = await getCurrentUser();
  const walletHref = user ? (user.isAdmin ? "/admin" : "/app") : "/signup";

  return (
    <div className="min-h-dvh bg-fm-sand">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-fm-sand/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4 lg:px-8">
          <Link href="/" className="mr-auto">
            <BrandMark />
          </Link>
          <nav className="hidden items-center gap-7 text-[13.5px] font-medium text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#engine" className="transition-colors hover:text-foreground">
              Security
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
          </nav>
          {user ? null : (
            <Link
              href="/login"
              className="hidden text-[13.5px] font-semibold text-foreground transition-colors hover:text-primary sm:block"
            >
              Sign in
            </Link>
          )}
          <Link
            href={walletHref}
            className="rounded-full bg-fm-ink px-5 py-3 font-display text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            {user ? "Open wallet" : "Create account"}
          </Link>
        </div>
      </header>

      <section className="fm-ambient relative isolate overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-fm-ink/10 bg-white/70 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fm-ink/70">
              <Zap className="h-3.5 w-3.5 text-fm-green" />
              instant transfers by handle
            </span>

            <h1 className="mt-7 font-display text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] text-fm-ink sm:text-[52px] lg:text-[58px]">
              Money that moves the moment you decide.
            </h1>

            <p className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-muted-foreground">
              Send to any <span className="fm-numeric font-medium text-foreground">@handle</span>, add
              funds with a deposit code, request a payout, and follow every movement in a single
              ledger. One wallet, no branch queues.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Magnetic>
                <Link href="/signup" className="fm-btn fm-btn-primary px-6">
                  Create your account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Magnetic>
              <Link href="/login" className="fm-btn fm-btn-ghost px-6">
                I already have a handle
              </Link>
            </div>

            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Open an account in seconds · your handle is your address
            </p>
          </div>

          <Reveal delay={0.1} y={22}>
            <PhonePreview />
          </Reveal>
        </div>
      </section>

      <section className="border-y border-black/5 bg-white/70">
        <RevealGroup className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-7 px-5 py-10 lg:grid-cols-4 lg:px-8">
          {[
            { k: "$0.00", v: "to open a wallet" },
            { k: "Instant", v: "transfers between handles" },
            { k: "1–2 days", v: "typical payout review" },
            { k: "Server-side", v: "balance verification on every move" },
          ].map((stat) => (
            <RevealItem key={stat.k}>
              <p className="fm-numeric font-display text-[26px] font-semibold text-fm-ink">
                {stat.k}
              </p>
              <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{stat.v}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-24">
        <Reveal>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            How it works
          </p>
          <h2 className="mt-4 max-w-2xl font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-fm-ink lg:text-[40px]">
            Three steps from a handle to a settled payment.
          </h2>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Claim your handle",
              body: "Choose an @username — it becomes the address people pay you with, and it stays yours.",
            },
            {
              n: "02",
              title: "Add funds with a code",
              body: "Deposit codes are issued for your account. Enter the code, we verify it, and the balance updates instantly.",
            },
            {
              n: "03",
              title: "Send, receive, withdraw",
              body: "Transfers land instantly. Payout requests are reviewed and you can follow every status change in Activity.",
            },
          ].map((step) => (
            <RevealItem key={step.n}>
              <article className="h-full rounded-[28px] border border-black/5 bg-white p-7 shadow-[0_22px_48px_-38px_rgba(7,24,20,0.7)]">
                <span className="font-mono text-[11.5px] tracking-[0.2em] text-fm-green">{step.n}</span>
                <h3 className="mt-5 font-display text-[18px] font-semibold text-fm-ink">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      <section id="engine" className="bg-fm-ink py-20 text-white lg:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <Reveal>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fm-lime">
              Built for trust
            </p>
            <h2 className="mt-4 font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] lg:text-[40px]">
              Every balance change is decided by our servers, never by a browser.
            </h2>
            <p className="mt-6 max-w-lg text-[14.5px] leading-relaxed text-white/60">
              A transfer, a deposit and a payout all run inside one database transaction: the sender
              is re-read from the database, the amount is checked against the real balance, and the
              ledger row is written before anything is confirmed. If any step fails, all of it rolls
              back.
            </p>

            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fm-lime">
                  No overdrafts
                </p>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/55">
                  The balance check and the debit are a single statement, so simultaneous requests
                  can never push an account below zero.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fm-lime">
                  Codes can&apos;t be reused
                </p>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/55">
                  A single-use deposit code is claimed with a conditional update, so it cannot be
                  redeemed twice — even by two requests at once.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.12} y={22}>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
              <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-fm-lime/70" />
                <span className="ml-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/40">
                  transfer_funds()
                </span>
              </div>

              <ol className="mt-5 space-y-3.5">
                {[
                  ["BEGIN", "one serializable database transaction"],
                  ["SELECT sender", "re-read from the database, never from the request"],
                  ["DENY", "self-transfers, zero and negative amounts"],
                  ["DEBIT", "balance − amount WHERE balance ≥ amount"],
                  ["CREDIT", "recipient balance + amount"],
                  ["LEDGER", "reference, status and both balances recorded"],
                  ["COMMIT", "confirmed only once everything succeeded"],
                ].map(([tag, text], index) => (
                  <li key={tag} className="flex items-start gap-3.5">
                    <span className="w-6 shrink-0 font-mono text-[10.5px] text-white/30">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="w-[78px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fm-lime">
                      {tag}
                    </span>
                    <span className="text-[12.5px] leading-relaxed text-white/55">{text}</span>
                  </li>
                ))}
              </ol>

              <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/45">
                any failure → full rollback · failed attempts logged with their reason
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-24">
        <Reveal>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            What&apos;s inside
          </p>
          <h2 className="mt-4 max-w-2xl font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-fm-ink lg:text-[40px]">
            A complete wallet, down to the last receipt.
          </h2>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Send,
              title: "Instant transfers",
              body: "Pay any handle by searching it, confirming the amount and sending. Both balances update at once.",
            },
            {
              icon: Banknote,
              title: "Deposits by code",
              body: "Enter the code issued for your account and the amount it carries is credited after server-side verification.",
            },
            {
              icon: Landmark,
              title: "Payout requests",
              body: "Request a withdrawal to a bank, card or wallet reference and track it from Processing to settled.",
            },
            {
              icon: Receipt,
              title: "Full transaction history",
              body: "Every row carries a transaction ID, type, amount, timestamp, counterparty and status.",
            },
            {
              icon: UserCircle2,
              title: "Your profile",
              body: "Change your handle, add a profile picture and it follows you through transfers and activity.",
            },
            {
              icon: FlaskConical,
              title: "Operations console",
              body: "A separate console for reviewing profiles, issuing deposit codes and signing off payout requests.",
            },
          ].map((feature) => (
            <RevealItem key={feature.title}>
              <article className="h-full rounded-[26px] border border-black/5 bg-white p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-primary">
                  <feature.icon className="h-[19px] w-[19px]" strokeWidth={2.1} />
                </span>
                <h3 className="mt-5 font-display text-[15.5px] font-semibold text-fm-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      <section className="border-y border-black/5 bg-white/70 py-20 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <Reveal>
            <h2 className="max-w-2xl font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-fm-ink lg:text-[40px]">
              Protections built into the wallet.
            </h2>
          </Reveal>

          <RevealGroup className="mt-12 grid gap-5 md:grid-cols-2">
            <RevealItem>
              <div className="h-full rounded-[28px] border border-fm-green/20 bg-white p-7">
                <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fm-green">
                  <ShieldCheck className="h-4 w-4" />
                  what we enforce
                </span>
                <ul className="mt-5 space-y-3.5 text-[13.5px] text-muted-foreground">
                  {[
                    "Balances only ever change through verified server operations",
                    "Transfers, deposits and payouts are atomic — no half-completed moves",
                    "Payout amounts are held while a request is under review",
                    "Single-use deposit codes cannot be redeemed twice",
                    "Failed attempts are recorded with their reason for review",
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-fm-green" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </RevealItem>

            <RevealItem>
              <div className="h-full rounded-[28px] border border-border bg-white p-7">
                <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  account rules
                </span>
                <ul className="mt-5 space-y-3.5 text-[13.5px] text-muted-foreground">
                  {[
                    "Handles are unique — no two accounts share an address",
                    "You can never send to your own handle",
                    "Withdrawals need a named destination before they can be submitted",
                    "New wallets open at $0.00 and only move with verified funds",
                    "Every request keeps its own transaction ID for reference",
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </RevealItem>
          </RevealGroup>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
        <Reveal>
          <div className="fm-ambient relative isolate overflow-hidden rounded-[32px] bg-fm-ink px-8 py-14 text-white lg:px-14 lg:py-16">
            <div aria-hidden className="fm-grain absolute inset-0 -z-10 opacity-25" />
            <div className="flex flex-wrap items-center justify-between gap-10">
              <div className="max-w-xl">
                <h2 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] lg:text-[36px]">
                  Open a wallet, claim your handle, and move your first payment.
                </h2>
                <p className="mt-5 text-[13.5px] leading-relaxed text-white/60">
                  Accounts open at $0.00. Add funds with a deposit code or receive a transfer from
                  another handle, then send, withdraw and track everything in one place.
                </p>
              </div>
              <Magnetic strength={0.28}>
                <Link
                  href={user ? walletHref : "/signup"}
                  className="fm-btn fm-btn-accent px-7"
                >
                  {user ? "Back to your wallet" : "Create your wallet"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Magnetic>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-black/5 bg-white/70">
        <div className="mx-auto max-w-6xl px-5 py-9 lg:px-8">
          <div className="flex flex-wrap items-center gap-5">
            <BrandMark />
            <p className="mr-auto font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              Send · Deposit · Withdraw · Track
            </p>
            <Link
              href="/login"
              className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              Create account
            </Link>
          </div>
          <p className="mt-6 max-w-3xl text-[11.5px] leading-relaxed text-muted-foreground/80">
            INSTANT PAYMENT gives you one account for peer-to-peer transfers, code-funded deposits
            and payout requests, with a transaction record for every movement.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Product mock built from real markup rather than a screenshot. */
function PhonePreview() {
  return (
    <div className="relative mx-auto w-full max-w-[350px]">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[48px] bg-fm-ink/8 blur-2xl" />
      <div className="rounded-[40px] border border-black/10 bg-fm-ink p-2.5 shadow-[0_40px_80px_-40px_rgba(7,24,20,0.85)]">
        <div className="overflow-hidden rounded-[32px] bg-fm-sand">
          <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
            <BrandMark showWord={false} />
            <span className="fm-numeric font-mono text-[10px] text-muted-foreground">@ada</span>
          </div>

          <div className="px-3.5 pb-3">
            <div className="relative isolate overflow-hidden rounded-[24px] bg-fm-ink px-4 py-4 text-white">
              <div
                aria-hidden
                className="absolute inset-0 -z-10"
                style={{
                  backgroundImage:
                    "radial-gradient(90% 70% at 88% 0%, rgba(22,199,139,0.34), transparent 62%), radial-gradient(70% 60% at 4% 100%, rgba(200,242,74,0.16), transparent 66%)",
                }}
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/55">
                Available balance
              </span>
              <AnimatedAmount
                cents={128452}
                className="mt-2 block font-display text-[30px] font-semibold leading-none"
              />
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <span className="rounded-xl bg-fm-lime px-2 py-2 text-center font-display text-[11px] font-semibold text-fm-ink">
                  Send
                </span>
                <span className="rounded-xl border border-white/15 bg-white/5 py-2 text-center font-display text-[11px] font-semibold text-white/80">
                  Deposit
                </span>
                <span className="rounded-xl border border-white/15 bg-white/5 py-2 text-center font-display text-[11px] font-semibold text-white/80">
                  Withdraw
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-[22px] border border-black/5 bg-white p-2.5">
              <p className="px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                recent activity
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {[
                  {
                    name: "Mira Castellanos",
                    hue: 262,
                    amount: "+$240.00",
                    note: "transfer received",
                    tone: "text-fm-green",
                  },
                  {
                    name: "Deposit · ABC123",
                    hue: 158,
                    amount: "+$500.00",
                    note: "completed",
                    tone: "text-fm-green",
                  },
                  {
                    name: "Tunde Bakare",
                    hue: 172,
                    amount: "−$58.50",
                    note: "transfer sent",
                    tone: "text-fm-ink",
                  },
                ].map((row) => (
                  <li key={row.name} className="flex items-center gap-2.5 rounded-2xl px-1 py-1.5">
                    <Avatar displayName={row.name} hue={row.hue} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-fm-ink">{row.name}</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                        {row.note}
                      </p>
                    </div>
                    <span className={`fm-numeric font-display text-[12px] font-semibold ${row.tone}`}>
                      {row.amount}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-50/70 px-2.5 py-2">
                <Clock className="h-3.5 w-3.5 text-amber-700" />
                <span className="fm-numeric flex-1 text-[11px] font-semibold text-amber-900">
                  Withdrawal · $120.00
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-amber-700">
                  processing
                </span>
              </div>
            </div>

            <div className="mb-3 mt-3 grid grid-cols-4 gap-1 rounded-[20px] border border-black/5 bg-white p-1.5">
              {["Home", "Send", "Activity", "Profile"].map((tab, index) => (
                <span
                  key={tab}
                  className={`rounded-[14px] py-2 text-center font-display text-[10px] font-semibold ${
                    index === 0 ? "bg-fm-ink text-white" : "text-muted-foreground"
                  }`}
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-black/5 bg-white px-3.5 py-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground shadow-sm">
        <BadgeCheck className="h-3 w-3 text-fm-green" />
        every move in one ledger
      </span>
    </div>
  );
}
