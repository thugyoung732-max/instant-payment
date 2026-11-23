"use client";
import React from 'react';

import { Eraser, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { formatUSD } from "@/lib/money";
import { clearTransactionsAction, deleteTransactionAction } from "@/lib/actions/admin";

/**
 * Deletes a single ledger row, behind a two-step confirm. When the row is a
 * pending withdrawal the confirm spells out that its hold goes back to the user.
 */
export function DeleteTransactionButton({
  transactionId,
  reference,
  heldCents = 0,
}: {
  transactionId: string;
  reference: string;
  heldCents?: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const result = await deleteTransactionAction(transactionId);
    setBusy(false);

    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          {heldCents > 0 ? "Delete & release" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg border border-white/10 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/55 transition-colors hover:bg-white/8"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={
        heldCents > 0
          ? `Delete ${reference} — releases ${formatUSD(heldCents)} back to the user`
          : `Delete ${reference} from the ledger`
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/45 transition-colors hover:border-red-400/30 hover:text-red-300"
    >
      <Trash2 className="h-3 w-3" />
      Delete
    </button>
  );
}

/**
 * Bulk ledger cleanup for the console. States exactly what each option removes
 * and how much money it puts back, because deleting rows is irreversible.
 */
export function ClearTransactionsButton({
  total,
  settled,
  pendingCount,
  pendingHeldCents,
}: {
  total: number;
  settled: number;
  pendingCount: number;
  pendingHeldCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "ALL" | "SETTLED">(null);

  async function run(scope: "ALL" | "SETTLED") {
    setBusy(scope);
    const result = await clearTransactionsAction({ scope });
    setBusy(null);

    if (result.ok) {
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  if (total === 0) {
    return (
      <span className="rounded-full border border-white/10 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/35">
        Ledger is empty
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 font-display text-[12.5px] font-semibold text-white/80 transition-colors hover:border-red-400/30 hover:text-red-200"
      >
        <Eraser className="h-3.5 w-3.5" />
        Clear transactions
      </button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 rounded-2xl border border-red-400/25 bg-red-500/[0.07] px-4 py-3">
      <p className="mr-auto text-[11.5px] leading-relaxed text-white/55">
        Deleting rows never changes a balance. A pending request releases its hold first.
      </p>
      <button
        type="button"
        onClick={() => run("SETTLED")}
        disabled={busy !== null || settled === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/70 transition-colors hover:bg-white/8 disabled:opacity-40"
      >
        {busy === "SETTLED" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        Delete {settled} settled
      </button>
      <button
        type="button"
        onClick={() => run("ALL")}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-40"
      >
        {busy === "ALL" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        Delete all {total}
        {pendingCount > 0 ? ` (release ${formatUSD(pendingHeldCents)})` : ""}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={busy !== null}
        className="rounded-lg border border-white/10 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/55 transition-colors hover:bg-white/8"
      >
        Cancel
      </button>
    </div>
  );
}
