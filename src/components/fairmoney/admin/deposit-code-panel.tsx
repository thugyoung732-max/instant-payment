"use client";
import React from 'react';

import { Ban, Check, Coins, Loader2, Plus, Power, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { formatUSD, parseAmountToCents } from "@/lib/money";
import {
  createDepositCodeAction,
  deleteDepositCodeAction,
  seedDepositCodesAction,
  setDepositCodeActiveAction,
} from "@/server/actions/admin";

export type DepositCodeRow = {
  id: string;
  code: string;
  creditCents: number;
  label: string | null;
  active: boolean;
  singleUse: boolean;
  maxUses: number | null;
  uses: number;
  createdAt: Date;
  redemptions: number;
};

const PRESETS = [2500, 5000, 25000, 50000];

export function CreateDepositCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [singleUse, setSingleUse] = useState(true);
  const [maxUses, setMaxUses] = useState("5");
  const [busy, setBusy] = useState(false);

  const cents = parseAmountToCents(amount);
  const canSubmit = code.trim().length >= 4 && Boolean(cents) && !busy;

  async function submit() {
    if (!canSubmit || !cents) return;
    setBusy(true);
    const result = await createDepositCodeAction({
      code,
      creditCents: cents,
      label,
      singleUse,
      maxUses: singleUse ? 1 : Math.max(1, Number(maxUses) || 1),
    });
    setBusy(false);

    if (result.ok) {
      toast.success(result.message);
      setCode("");
      setAmount("");
      setLabel("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
      <h3 className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-white">
        <Plus className="h-4 w-4 text-fm-lime" />
        Issue a deposit code
      </h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
        The configured amount is what a code credits — the amount a user types in the app is never
        used.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Code
          </span>
          <input
            value={code}
            onChange={(event) =>
              setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32))
            }
            placeholder="ABC123"
            className="fm-numeric mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 font-mono text-sm tracking-[0.16em] text-white outline-none placeholder:text-white/25 focus:border-fm-green-bright/50"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Credits
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="500.00"
            className="fm-numeric mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-fm-green-bright/50"
          />
        </label>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount((preset / 100).toFixed(2))}
            className="rounded-full border border-white/10 px-3 py-1.5 font-mono text-[10.5px] text-white/70 transition-colors hover:bg-white/8"
          >
            {formatUSD(preset)}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Label (optional)
          </span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value.slice(0, 60))}
            placeholder="Welcome deposit"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-fm-green-bright/50"
          />
        </label>

        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Usage
          </span>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSingleUse(true)}
              className={`rounded-xl px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ${
                singleUse ? "bg-fm-lime text-fm-ink" : "border border-white/10 text-white/55"
              }`}
            >
              single use
            </button>
            <button
              type="button"
              onClick={() => setSingleUse(false)}
              className={`rounded-xl px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ${
                !singleUse ? "bg-fm-lime text-fm-ink" : "border border-white/10 text-white/55"
              }`}
            >
              multi use
            </button>
            {!singleUse ? (
              <input
                value={maxUses}
                onChange={(event) =>
                  setMaxUses(event.target.value.replace(/[^\d]/g, "").slice(0, 5))
                }
                inputMode="numeric"
                aria-label="Maximum redemptions"
                className="fm-numeric w-16 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2.5 text-sm text-white outline-none focus:border-fm-green-bright/50"
              />
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="mt-5 flex items-center gap-2 rounded-xl bg-fm-lime px-4 py-3 font-display text-[12.5px] font-semibold text-fm-ink transition-colors hover:bg-fm-lime/85 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Coins className="h-3.5 w-3.5" />
        )}
        Create code
      </button>
    </div>
  );
}

export function SeedDepositCodesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    const result = await seedDepositCodesAction();
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
      className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-3 font-display text-[12.5px] font-semibold text-white/85 transition-colors hover:bg-white/8 disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      Seed sample codes
    </button>
  );
}

export function CodeRowActions({
  codeId,
  code,
  active,
}: {
  codeId: string;
  code: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "toggle" | "delete">(null);

  async function toggle() {
    setBusy("toggle");
    const result = await setDepositCodeActiveAction(codeId, !active);
    setBusy(null);
    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function remove() {
    setBusy("delete");
    const result = await deleteDepositCodeAction(codeId);
    setBusy(null);
    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/70 transition-colors hover:bg-white/8"
      >
        {busy === "toggle" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : active ? (
          <Ban className="h-3 w-3" />
        ) : (
          <Power className="h-3 w-3" />
        )}
        {active ? "Disable" : "Enable"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/50 transition-colors hover:border-red-400/30 hover:text-red-300"
      >
        {busy === "delete" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
        Delete
      </button>
    </div>
  );
}

export function CodeStatusBadge({ row }: { row: DepositCodeRow }) {
  const exhausted = row.maxUses !== null && row.uses >= row.maxUses;

  if (!row.active) {
    return (
      <Badge
        variant="outline"
        className="border-white/15 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/45"
      >
        disabled
      </Badge>
    );
  }
  if (exhausted) {
    return (
      <Badge
        variant="outline"
        className="border-white/15 font-mono text-[10.5px] uppercase tracking-[0.1em] text-amber-300"
      >
        used up
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-fm-lime/30 bg-fm-lime/12 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fm-lime"
    >
      <Check className="h-3 w-3" />
      live
    </Badge>
  );
}
