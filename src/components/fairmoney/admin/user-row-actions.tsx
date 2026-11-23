"use client";
import React from 'react';

import { Coins, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatUSD, parseAmountToCents } from "@/lib/money";
import {
  adminCreditAction,
  adminResetBalanceAction,
  seedDemoAccountsAction,
} from "@/lib/actions/admin";

const PRESETS = [5000, 25000, 100000, 500000];

export function UserRowActions({
  userId,
  username,
  balanceCents,
}: {
  userId: string;
  username: string;
  balanceCents: number;
}) {
  const router = useRouter();
  const [creditOpen, setCreditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"credit" | "reset" | null>(null);

  const cents = parseAmountToCents(amount);

  async function submitCredit() {
    if (!cents) return;
    setBusy("credit");
    const result = await adminCreditAction({ userId, amountCents: cents, note });
    setBusy(null);
    if (result.ok) {
      toast.success(result.message);
      setCreditOpen(false);
      setAmount("");
      setNote("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function submitReset() {
    setBusy("reset");
    const result = await adminResetBalanceAction(userId);
    setBusy(null);
    if (result.ok) {
      toast.success(result.message);
      setResetOpen(false);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setCreditOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-accent px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-accent-foreground transition-colors hover:bg-accent/70"
      >
        <Coins className="h-3 w-3" />
        Credit
      </button>
      <button
        type="button"
        onClick={() => setResetOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
      >
        <RotateCcw className="h-3 w-3" />
        Reset
      </button>

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Adjust balance</DialogTitle>
            <DialogDescription className="text-xs">
              Adds funds to @{username} and writes an ADMIN_CREDIT ledger row.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="fm-numeric text-[11px] text-muted-foreground">
              Current balance {formatUSD(balanceCents)}
              {cents ? ` → ${formatUSD(balanceCents + cents)}` : ""}
            </p>

            <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/40 px-3 py-2.5 focus-within:border-primary/40 focus-within:bg-white">
              <span className="font-display text-lg font-semibold text-muted-foreground">$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
                className="fm-numeric min-w-0 flex-1 bg-transparent font-display text-lg font-semibold outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount((preset / 100).toFixed(2))}
                  className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] text-foreground transition-colors hover:bg-secondary"
                >
                  {formatUSD(preset)}
                </button>
              ))}
            </div>

            <input
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 120))}
              placeholder="Reason (optional)"
              className="w-full rounded-2xl border border-border bg-secondary/40 px-3 py-2.5 text-xs outline-none focus:border-primary/40 focus:bg-white"
            />

            <button
              type="button"
              onClick={submitCredit}
              disabled={!cents || busy === "credit"}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fm-green px-4 py-3 font-display text-sm font-semibold text-white transition-colors hover:bg-fm-green/90 disabled:opacity-50"
            >
              {busy === "credit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
              Credit {cents ? formatUSD(cents) : "funds"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Reset balance</DialogTitle>
            <DialogDescription className="text-xs">
              Sets @{username}&apos;s balance to $0.00 and logs the cleared amount. History is never
              deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="flex-1 rounded-2xl border border-border px-4 py-3 font-display text-sm font-semibold transition-colors hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitReset}
              disabled={busy === "reset"}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-destructive px-4 py-3 font-display text-sm font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Reset balance
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SeedDemoAccountsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    const result = await seedDemoAccountsAction();
    setBusy(false);
    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <button
      type="button"
      onClick={seed}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl bg-fm-lime px-3.5 py-2.5 font-display text-[12px] font-semibold text-fm-ink transition-colors hover:bg-fm-lime/85 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
      Seed demo profiles
    </button>
  );
}
