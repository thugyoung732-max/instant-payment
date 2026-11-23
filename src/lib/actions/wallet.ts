"use server";

import { revalidatePath } from "next/cache";

import { findDestination } from "@/lib/destinations";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  depositSchema,
  firstIssue,
  normaliseUsername,
  withdrawalSchema,
} from "@/lib/validation";

/**
 * Simulated money movements.
 *
 * Each action is a thin, validating wrapper around one Postgres function. The
 * function — not this file — is where the money moves: it locks the rows it
 * needs, checks the balance, writes the ledger row and returns the resulting
 * balance. That means a customer can call these actions as often as they like
 * and still never touch a balance they were not entitled to move.
 *
 * Nothing here connects to a payment network. Every "transfer", "deposit" and
 * "withdrawal" is an entry in a simulation.
 */

const NOT_CONFIGURED =
  "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.";

const UNAUTHENTICATED = "Your session expired. Sign in again to continue.";

const TRANSFER_MESSAGES: Record<string, string> = {
  SELF_TRANSFER: "You can't send money to your own account.",
  RECIPIENT_NOT_FOUND: "We couldn't find that @username.",
  INSUFFICIENT_FUNDS: "Your available balance is too low for this transfer.",
  INVALID_AMOUNT: "Enter an amount above $0.00.",
  UNAUTHENTICATED,
};

const DEPOSIT_MESSAGES: Record<string, string> = {
  INVALID_CODE: "That deposit code isn't recognised.",
  CODE_EXHAUSTED: "That deposit code has already been used.",
  INVALID_AMOUNT: "Enter an amount above $0.00.",
  UNAUTHENTICATED,
};

const WITHDRAWAL_MESSAGES: Record<string, string> = {
  INSUFFICIENT_FUNDS: "Your available balance is too low for this withdrawal.",
  INVALID_AMOUNT: "Enter an amount above $0.00.",
  INVALID_DESTINATION: "Add the destination account details.",
  UNAUTHENTICATED,
};

type RpcPayload = Record<string, unknown>;

function rpcFailure(error: { message?: string } | null, fallback: string): string {
  const message = (error?.message ?? "").trim();
  if (!message) return fallback;
  if (message.includes("UNAUTHENTICATED")) return UNAUTHENTICATED;
  // Raised database errors arrive as the bare code (e.g. "INVALID_AMOUNT").
  return message.split("\n")[0].slice(0, 160);
}

function reasonFor(
  payload: RpcPayload | null,
  messages: Record<string, string>,
  fallback: string,
): string {
  const code = typeof payload?.code === "string" ? payload.code : "";
  return messages[code] ?? fallback;
}

function refreshWalletViews() {
  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export type TransferResult =
  | {
      ok: true;
      reference: string;
      amountCents: number;
      note: string | null;
      createdAt: string;
      senderBalanceAfterCents: number;
      recipient: { username: string; displayName: string; avatarHue: number };
    }
  | { ok: false; code: string; message: string };

export async function sendMoneyAction(input: {
  recipientUsername: string;
  amountCents: number;
  note?: string;
}): Promise<TransferResult> {
  if (!supabaseConfigured()) {
    return { ok: false, code: "UNAUTHENTICATED", message: NOT_CONFIGURED };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", message: UNAUTHENTICATED };

  const { data, error } = await supabase.rpc("send_transfer", {
    p_recipient: normaliseUsername(input.recipientUsername ?? ""),
    p_amount_cents: Math.round(Number(input.amountCents)),
    p_note: input.note?.trim() ? input.note.trim() : null,
  });

  if (error) {
    const message = rpcFailure(error, "We couldn't complete that transfer. Try again.");
    return { ok: false, code: "BUSY", message };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (payload.ok !== true) {
    return {
      ok: false,
      code: typeof payload.code === "string" ? payload.code : "BUSY",
      message: reasonFor(payload, TRANSFER_MESSAGES, "We couldn't complete that transfer."),
    };
  }

  refreshWalletViews();

  return {
    ok: true,
    reference: String(payload.reference ?? ""),
    amountCents: Number(payload.amountCents ?? input.amountCents),
    note: (payload.note as string | null) ?? null,
    createdAt: String(payload.createdAt ?? new Date().toISOString()),
    senderBalanceAfterCents: Number(payload.senderBalanceAfterCents ?? 0),
    recipient: {
      username: String(payload.recipientUsername ?? ""),
      displayName: String(payload.recipientDisplayName ?? ""),
      avatarHue: Number(payload.recipientAvatarHue ?? 156),
    },
  };
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export type DepositResult =
  | {
      ok: true;
      reference: string;
      creditedCents: number;
      declaredCents: number | null;
      balanceAfterCents: number;
      code: string;
      codeLabel: string | null;
      createdAt: string;
    }
  | { ok: false; code: string; message: string };

export async function depositAction(input: {
  code: string;
  amountCents?: number;
}): Promise<DepositResult> {
  if (!supabaseConfigured()) {
    return { ok: false, code: "UNAUTHENTICATED", message: NOT_CONFIGURED };
  }

  const parsed = depositSchema.safeParse({
    code: input.code ?? "",
    amountCents: Number.isFinite(input.amountCents)
      ? Math.round(Number(input.amountCents))
      : undefined,
  });
  if (!parsed.success) {
    return { ok: false, code: "INVALID_CODE", message: firstIssue(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", message: UNAUTHENTICATED };

  const { data, error } = await supabase.rpc("redeem_deposit_code", {
    p_code: parsed.data.code,
    p_declared_cents: parsed.data.amountCents ?? null,
  });

  if (error) {
    return { ok: false, code: "BUSY", message: rpcFailure(error, "That deposit didn't go through.") };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (payload.ok !== true) {
    return {
      ok: false,
      code: typeof payload.code === "string" ? payload.code : "INVALID_CODE",
      message: reasonFor(payload, DEPOSIT_MESSAGES, "That deposit didn't go through."),
    };
  }

  refreshWalletViews();

  return {
    ok: true,
    reference: String(payload.reference ?? ""),
    creditedCents: Number(payload.creditedCents ?? 0),
    declaredCents: payload.declaredCents === null ? null : Number(payload.declaredCents ?? 0),
    balanceAfterCents: Number(payload.balanceAfterCents ?? 0),
    code: String(payload.code ?? parsed.data.code),
    codeLabel: (payload.codeLabel as string | null) ?? null,
    createdAt: String(payload.createdAt ?? new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

export type WithdrawalResult =
  | {
      ok: true;
      reference: string;
      amountCents: number;
      feeCents: number;
      totalCents: number;
      destination: string;
      balanceAfterCents: number;
      createdAt: string;
    }
  | { ok: false; code: string; message: string };

export async function withdrawAction(input: {
  amountCents: number;
  destinationId: string;
  accountName: string;
  identifier: string;
}): Promise<WithdrawalResult> {
  if (!supabaseConfigured()) {
    return { ok: false, code: "UNAUTHENTICATED", message: NOT_CONFIGURED };
  }

  const parsed = withdrawalSchema.safeParse({
    amountCents: Math.round(Number(input.amountCents)),
    destinationId: input.destinationId ?? "",
    accountName: input.accountName ?? "",
    identifier: input.identifier ?? "",
  });
  if (!parsed.success) {
    return { ok: false, code: "INVALID_DESTINATION", message: firstIssue(parsed.error) };
  }

  const destination = findDestination(parsed.data.destinationId);
  if (!destination) {
    return { ok: false, code: "INVALID_DESTINATION", message: "Choose a destination." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", message: UNAUTHENTICATED };

  const label = `${destination.label} · ${parsed.data.identifier} · ${parsed.data.accountName}`;

  const { data, error } = await supabase.rpc("request_withdrawal", {
    p_amount_cents: parsed.data.amountCents,
    p_destination: label,
  });

  if (error) {
    return {
      ok: false,
      code: "BUSY",
      message: rpcFailure(error, "That withdrawal request didn't go through."),
    };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (payload.ok !== true) {
    return {
      ok: false,
      code: typeof payload.code === "string" ? payload.code : "INSUFFICIENT_FUNDS",
      message: reasonFor(payload, WITHDRAWAL_MESSAGES, "That withdrawal request didn't go through."),
    };
  }

  refreshWalletViews();

  return {
    ok: true,
    reference: String(payload.reference ?? ""),
    amountCents: Number(payload.amountCents ?? parsed.data.amountCents),
    feeCents: Number(payload.feeCents ?? 0),
    totalCents: Number(payload.totalCents ?? parsed.data.amountCents),
    destination: String(payload.destination ?? label),
    balanceAfterCents: Number(payload.balanceAfterCents ?? 0),
    createdAt: String(payload.createdAt ?? new Date().toISOString()),
  };
}
