"use client";
import React from 'react';

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  Loader2,
  Lock,
  Send,
  TriangleAlert,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AnimatedAmount } from "@/components/fairmoney/animated-amount";
import { Avatar } from "@/components/fairmoney/avatar";
import { Magnetic } from "@/components/fairmoney/magnetic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatUSD, parseAmountToCents } from "@/lib/money";
import { normaliseUsername } from "@/lib/validation";
import { lookupRecipient } from "@/lib/actions/auth";
import { sendMoneyAction } from "@/lib/actions/wallet";
import type { RecipientLookup } from "@/lib/data/types";

type Receipt = {
  reference: string;
  amountCents: number;
  note: string | null;
  senderBalanceAfterCents: number;
  recipient: { username: string; displayName: string; avatarHue: number };
};

type SendFlowProps = {
  me: { username: string; displayName: string; balanceCents: number };
  contacts: Array<{
    username: string;
    displayName: string;
    avatarHue: number;
    avatarUpdatedAt: Date | null;
  }>;
  initialRecipient?: string;
};

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000];

export function SendFlow({ me, contacts, initialRecipient }: SendFlowProps) {
  const router = useRouter();

  const [recipient, setRecipient] = useState(initialRecipient ?? "");
  const [lookup, setLookup] = useState<RecipientLookup | null>(null);
  const [checking, setChecking] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const requestRef = useRef(0);
  const amountCents = parseAmountToCents(amount);

  // Debounced handle lookup: the recipient is confirmed before an amount is even
  // typed, so a transfer can never be sent to nobody.
  useEffect(() => {
    const username = normaliseUsername(recipient);
    if (!username) {
      setLookup(null);
      setChecking(false);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setChecking(true);

    const timer = setTimeout(async () => {
      try {
        const result = await lookupRecipient(username);
        if (requestRef.current === requestId) setLookup(result);
      } catch {
        if (requestRef.current === requestId) setLookup({ status: "missing", username });
      } finally {
        if (requestRef.current === requestId) setChecking(false);
      }
    }, 380);

    return () => clearTimeout(timer);
  }, [recipient]);

  const recipientReady = lookup?.status === "found";
  const amountValid = amountCents !== null && amountCents <= me.balanceCents;
  const overdraft = amountCents !== null && amountCents > me.balanceCents;
  const canReview = recipientReady && amountValid && !submitting;

  function resetFlow() {
    setReceipt(null);
    setRecipient("");
    setLookup(null);
    setAmount("");
    setNote("");
    setError(null);
    setConfirmOpen(false);
  }

  async function confirmTransfer() {
    if (!recipientReady || !amountCents) return;
    setSubmitting(true);
    setError(null);

    const result = await sendMoneyAction({
      recipientUsername: lookup.username,
      amountCents,
      note,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      setConfirmOpen(false);
      toast.error(result.message);
      router.refresh();
      return;
    }

    setConfirmOpen(false);
    setReceipt({
      reference: result.reference,
      amountCents: result.amountCents,
      note: result.note,
      senderBalanceAfterCents: result.senderBalanceAfterCents,
      recipient: result.recipient,
    });
    toast.success(`Settled ${formatUSD(result.amountCents)} to @${result.recipient.username}`);
    router.refresh();
  }

  if (receipt) {
    return <TransferReceipt receipt={receipt} onAgain={resetFlow} />;
  }

  return (
    <div className="space-y-6">
      <section className="fm-card px-6 py-6">
        <label htmlFor="recipient" className="fm-label">
          Recipient handle
        </label>
        <div className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 transition-colors focus-within:border-primary/45 focus-within:bg-white">
          <span className="font-display text-[22px] font-semibold text-muted-foreground">@</span>
          <input
            id="recipient"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value.replace(/\s/g, ""))}
            placeholder="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="fm-numeric min-w-0 flex-1 bg-transparent font-display text-[22px] font-medium text-foreground outline-none placeholder:text-muted-foreground/45"
          />
          {checking ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="mt-4 min-h-[64px]">
          <AnimatePresence mode="wait" initial={false}>
            {lookup ? (
              <motion.div
                key={`${lookup.status}-${lookup.username}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <LookupResult lookup={lookup} />
              </motion.div>
            ) : (
              <motion.p
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-1 text-[13px] leading-relaxed text-muted-foreground"
              >
                Handles are unique on INSTANT PAYMENT. Type one to confirm the account before
                sending.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {contacts.length > 0 && !recipient ? (
          <div className="mt-5 border-t border-border/70 pt-5">
            <p className="fm-label">Recent</p>
            <ul className="mt-3.5 flex flex-wrap gap-2.5">
              {contacts.map((contact) => (
                <li key={contact.username}>
                  <button
                    type="button"
                    onClick={() => setRecipient(contact.username)}
                    className="fm-chip"
                  >
                    <Avatar
                      displayName={contact.displayName}
                      hue={contact.avatarHue}
                      username={contact.username}
                      avatarUpdatedAt={contact.avatarUpdatedAt}
                      size="sm"
                    />
                    @{contact.username}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="fm-card px-6 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <label htmlFor="amount" className="fm-label">
            Amount
          </label>
          <span className="fm-numeric text-[12.5px] text-muted-foreground">
            Available {formatUSD(me.balanceCents)}
          </span>
        </div>

        <div className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 transition-colors focus-within:border-primary/45 focus-within:bg-white">
          <span className="font-display text-[26px] font-semibold text-muted-foreground">$</span>
          <input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            aria-label="Amount"
            className="fm-numeric min-w-0 flex-1 bg-transparent font-display text-[26px] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/45"
          />
          {amount ? (
            <button
              type="button"
              onClick={() => setAmount("")}
              className="shrink-0 rounded-full px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
            >
              clear
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {QUICK_AMOUNTS.map((cents) => (
            <Magnetic key={cents} strength={0.18}>
              <button
                type="button"
                onClick={() => setAmount((cents / 100).toFixed(2))}
                className="fm-chip"
              >
                {formatUSD(cents)}
              </button>
            </Magnetic>
          ))}
          <button
            type="button"
            onClick={() => setAmount((me.balanceCents / 100).toFixed(2))}
            className="fm-chip border-transparent bg-fm-ink text-fm-lime hover:bg-fm-ink-soft"
          >
            Max
          </button>
        </div>

        {overdraft ? (
          <p className="mt-4 flex items-center gap-2 text-[12.5px] text-destructive">
            <TriangleAlert className="h-4 w-4" />
            That is more than your available balance.
          </p>
        ) : null}

        <label htmlFor="note" className="fm-label mt-7 block">
          Note (optional)
        </label>
        <input
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 120))}
          placeholder="Rent, dinner, tickets…"
          className="fm-field mt-3.5"
        />
      </section>

      {error ? (
        <div className="fm-notice border border-destructive/25 bg-destructive/8 text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <Magnetic className="w-full" strength={0.16}>
        <button
          type="button"
          disabled={!canReview}
          onClick={() => setConfirmOpen(true)}
          className="fm-btn fm-btn-primary w-full"
        >
          Review transfer
          <ArrowRight className="h-4 w-4" />
        </button>
      </Magnetic>

      <p className="flex items-center justify-center gap-2.5 text-center text-[12.5px] text-muted-foreground">
        <Lock className="h-4 w-4" />
        Transfers settle instantly and can&apos;t be reversed once confirmed.
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="fixed inset-x-0 bottom-0 top-auto max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-[28px] border-border p-6 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-lg">Confirm transfer</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              This settles immediately and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {lookup && lookup.status === "found" ? (
            <div className="mt-1 space-y-5">
              <div className="flex items-center gap-4 rounded-[22px] border border-border bg-secondary/40 p-4">
                <Avatar
                  displayName={lookup.displayName}
                  hue={lookup.avatarHue}
                  username={lookup.username}
                  avatarUpdatedAt={lookup.avatarUpdatedAt}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-semibold">
                    {lookup.displayName}
                  </p>
                  <p className="fm-numeric mt-1 truncate font-mono text-[11.5px] text-muted-foreground">
                    @{lookup.username}
                  </p>
                </div>
                <p className="fm-numeric ml-auto font-display text-xl font-semibold text-fm-green">
                  {amountCents ? formatUSD(amountCents) : "—"}
                </p>
              </div>

              <dl className="space-y-3 text-[13px]">
                <Row label="Available now" value={formatUSD(me.balanceCents)} />
                <Row
                  label="Balance after transfer"
                  value={amountCents ? formatUSD(Math.max(me.balanceCents - amountCents, 0)) : "—"}
                  strong
                />
                <Row label="Fees" value="$0.00" />
                {note ? <Row label="Note" value={note} /> : null}
              </dl>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="fm-btn fm-btn-ghost flex-1"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmTransfer}
                  disabled={submitting}
                  className="fm-btn fm-btn-accent flex-[1.4]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Settling
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send now
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          strong
            ? "fm-numeric font-display font-semibold text-foreground"
            : "fm-numeric text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function LookupResult({ lookup }: { lookup: RecipientLookup }) {
  if (lookup.status === "found") {
    return (
      <div className="flex items-center gap-3.5 rounded-[20px] border border-emerald-600/20 bg-emerald-50/70 px-4 py-3.5">
        <Avatar
          displayName={lookup.displayName}
          hue={lookup.avatarHue}
          username={lookup.username}
          avatarUpdatedAt={lookup.avatarUpdatedAt}
          size="sm"
        />
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold text-emerald-900">
            {lookup.displayName}
          </p>
          <p className="fm-numeric mt-0.5 truncate font-mono text-[11.5px] text-emerald-700">
            @{lookup.username} · verified account
          </p>
        </div>
        <BadgeCheck className="ml-auto h-4.5 w-4.5 shrink-0 text-emerald-600" />
      </div>
    );
  }

  if (lookup.status === "self") {
    return (
      <Notice tone="warn" icon={<UserX className="h-3.5 w-3.5" />}>
        That&apos;s your own handle — Fairmoney blocks self-transfers.
      </Notice>
    );
  }

  if (lookup.status === "invalid") {
    return (
      <Notice tone="muted" icon={<CircleAlert className="h-3.5 w-3.5" />}>
        Use 3–20 characters: letters, numbers or underscore.
      </Notice>
    );
  }

  return (
    <Notice tone="danger" icon={<CircleAlert className="h-3.5 w-3.5" />}>
      No @{lookup.username} found on INSTANT PAYMENT.
    </Notice>
  );
}

function Notice({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  tone: "warn" | "danger" | "muted";
}) {
  const tones = {
    warn: "border-amber-500/25 bg-amber-50 text-amber-800",
    danger: "border-destructive/25 bg-destructive/8 text-destructive",
    muted: "border-border bg-secondary/60 text-muted-foreground",
  } as const;

  return (
    <div className={`fm-notice items-center border ${tones[tone]}`}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

function TransferReceipt({ receipt, onAgain }: { receipt: Receipt; onAgain: () => void }) {
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
          <Send className="h-6 w-6" strokeWidth={2.4} />
        </motion.span>

        <p className="fm-label mt-6 text-white/55">Transfer settled</p>
        <p className="fm-numeric mt-3 font-display text-[40px] font-semibold leading-none tracking-[-0.03em]">
          {formatUSD(receipt.amountCents)}
        </p>
        <p className="mt-3.5 text-[14px] leading-relaxed text-white/75">
          sent to <span className="font-semibold text-white">@{receipt.recipient.username}</span> ·{" "}
          {receipt.recipient.displayName}
        </p>

        <div className="mt-6 rounded-[22px] bg-white/8 px-5 py-4">
          <p className="fm-label text-white/50">New available balance</p>
          <AnimatedAmount
            cents={receipt.senderBalanceAfterCents}
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
          {receipt.note ? (
            <div className="flex items-center justify-between gap-4">
              <dt>Note</dt>
              <dd className="truncate italic">“{receipt.note}”</dd>
            </div>
          ) : null}
        </dl>
      </motion.section>

      <div className="flex gap-3">
        <button type="button" onClick={onAgain} className="fm-btn fm-btn-ghost flex-1">
          Send another
        </button>
        <Link href="/app" className="fm-btn fm-btn-primary flex-1">
          Back to home
        </Link>
      </div>
    </div>
  );
}
