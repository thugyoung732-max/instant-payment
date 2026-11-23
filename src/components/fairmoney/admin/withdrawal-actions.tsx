"use client";
import React from 'react';

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { resolveWithdrawalAction } from "@/lib/actions/admin";

export function WithdrawalActions({
  transactionId,
  reference,
}: {
  transactionId: string;
  reference: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "COMPLETED" | "FAILED">(null);

  async function resolve(outcome: "COMPLETED" | "FAILED") {
    setBusy(outcome);
    const result = await resolveWithdrawalAction({
      transactionId,
      outcome,
      reason: outcome === "FAILED" ? "Request declined during review" : undefined,
    });
    setBusy(null);

    if (result.ok) {
      toast.success(`${reference} · ${result.message}`);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => resolve("COMPLETED")}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-lg border border-fm-green/30 bg-fm-green/12 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fm-lime transition-colors hover:bg-fm-green/20"
      >
        {busy === "COMPLETED" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        Complete
      </button>
      <button
        type="button"
        onClick={() => resolve("FAILED")}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/60 transition-colors hover:border-red-400/30 hover:text-red-300"
      >
        {busy === "FAILED" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        Fail &amp; release
      </button>
    </div>
  );
}
