"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { formatUSD } from "@/lib/money";
import type { AdminActionResult } from "@/lib/data/types";
import { supabaseConfigured, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  adminCodeSchema,
  adminCreditSchema,
  clearTransactionsSchema,
  firstIssue,
  withdrawalFeeSchema,
  type FeeApplyScope,
} from "@/lib/validation";

/**
 * Operations-console actions.
 *
 * Each one calls an `admin_*` Postgres function. The authorisation check lives in
 * the database (`public.assert_admin()` raises unless `profiles.is_admin` is true
 * for `auth.uid()`), so a customer who learns an action's name and payload still
 * cannot execute it — the guard here only produces a friendlier error and avoids
 * pointless round trips.
 */

const NOT_CONFIGURED: AdminActionResult = {
  ok: false,
  message:
    "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.",
};

const EXPIRED: AdminActionResult = { ok: false, message: "Your session expired. Sign in again." };
const DENIED: AdminActionResult = {
  ok: false,
  message: "Operations console access is admin-only.",
};

function refreshConsole() {
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
}

/** An authenticated server client, as built by `@/lib/supabase/server`. */
type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Result of the console gate.
 *
 * The union is written out instead of inferred from the `return` statements on
 * purpose. An inferred union of object literals gains a phantom
 * `blocked?: undefined` on the success branch, so `"blocked" in gate` narrows to
 * `{ blocked: AdminActionResult; blocked?: undefined }` and `gate.blocked`
 * becomes `AdminActionResult | undefined` — which then fails every
 * `Promise<AdminActionResult>` signature. Declaring the two branches as
 * distinct types makes the `in` check exhaustive: after it, `gate.blocked` is
 * exactly `AdminActionResult` and `gate.supabase` is exactly the client.
 */
type AdminGate = { blocked: AdminActionResult } | { supabase: ServerSupabaseClient };

async function requireAdminClient(): Promise<AdminGate> {
  if (!supabaseConfigured()) return { blocked: NOT_CONFIGURED };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { blocked: EXPIRED };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) return { blocked: DENIED };

  return { supabase };
}

/** Turns a raised database error into a console-friendly sentence. */
function failure(error: { message?: string } | null, fallback: string): AdminActionResult {
  const message = (error?.message ?? "").trim();
  if (message.includes("ADMIN_ONLY")) return DENIED;
  if (message.includes("UNAUTHENTICATED")) return EXPIRED;
  return { ok: false, message: fallback };
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export async function adminCreditAction(input: {
  userId: string;
  amountCents: number;
  note?: string;
}): Promise<AdminActionResult> {
  const parsed = adminCreditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_credit", {
    p_user_id: parsed.data.userId,
    p_amount_cents: parsed.data.amountCents,
    p_note: parsed.data.note || null,
  });

  if (error) return failure(error, "That balance adjustment did not go through.");

  refreshConsole();

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    message: `Adjusted @${payload.username ?? "profile"} — new balance ${formatUSD(
      Number(payload.balanceCents ?? 0),
    )}.`,
  };
}

export async function adminResetBalanceAction(userId: string): Promise<AdminActionResult> {
  if (!userId) return { ok: false, message: "That profile no longer exists." };

  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_reset_balance", { p_user_id: userId });
  if (error) return failure(error, "That reset did not go through.");

  refreshConsole();

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    message: `Reset @${payload.username ?? "profile"}, clearing ${formatUSD(
      Number(payload.clearedCents ?? 0),
    )}.`,
  };
}

// ---------------------------------------------------------------------------
// Deposit codes
// ---------------------------------------------------------------------------

export async function createDepositCodeAction(input: {
  code: string;
  creditCents: number;
  label?: string;
  singleUse: boolean;
  maxUses: number | null;
}): Promise<AdminActionResult> {
  const parsed = adminCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_create_deposit_code", {
    p_code: parsed.data.code,
    p_credit_cents: parsed.data.creditCents,
    p_label: parsed.data.label || null,
    p_single_use: parsed.data.singleUse,
    p_max_uses: parsed.data.singleUse ? 1 : (parsed.data.maxUses ?? null),
  });

  if (error) {
    if ((error.message ?? "").includes("CODE_EXISTS")) {
      return { ok: false, message: `Code ${parsed.data.code} already exists.` };
    }
    if ((error.message ?? "").includes("INVALID_CODE_FORMAT")) {
      return { ok: false, message: "Codes are 4-32 letters and numbers." };
    }
    return failure(error, "That deposit code was not created.");
  }

  refreshConsole();

  const payload = (data ?? {}) as Record<string, unknown>;
  const maxUses = payload.maxUses === null || payload.maxUses === undefined ? null : Number(payload.maxUses);

  return {
    ok: true,
    message: `Code ${payload.code ?? parsed.data.code} created — credits ${formatUSD(
      Number(payload.creditCents ?? parsed.data.creditCents),
    )}${maxUses === null ? " (unlimited uses)" : ` (${maxUses} use${maxUses === 1 ? "" : "s"})`}.`,
  };
}

export async function setDepositCodeActiveAction(
  codeId: string,
  active: boolean,
): Promise<AdminActionResult> {
  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_set_code_active", {
    p_code_id: codeId,
    p_active: active,
  });

  if (error) return failure(error, "That code was not updated.");

  refreshConsole();

  const payload = (data ?? {}) as Record<string, unknown>;
  return { ok: true, message: `${payload.code ?? "Code"} ${active ? "re-activated" : "deactivated"}.` };
}

export async function deleteDepositCodeAction(codeId: string): Promise<AdminActionResult> {
  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_delete_deposit_code", {
    p_code_id: codeId,
  });

  if (error) return failure(error, "That code was not deleted.");

  refreshConsole();

  const payload = (data ?? {}) as Record<string, unknown>;
  const redemptions = Number(payload.redemptions ?? 0);

  return {
    ok: true,
    message:
      payload.deleted === true
        ? `${payload.code ?? "Code"} deleted.`
        : `${payload.code ?? "Code"} has ${redemptions} redemption(s) on record, so it was deactivated instead of deleted.`,
  };
}

export async function seedDepositCodesAction(): Promise<AdminActionResult> {
  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_seed_deposit_codes");
  if (error) return failure(error, "The sample codes were not created.");

  refreshConsole();

  const created = Number((data as Record<string, unknown> | null)?.created ?? 0);
  return {
    ok: true,
    message:
      created > 0
        ? `Created ${created} sample deposit code${created === 1 ? "" : "s"}.`
        : "Sample deposit codes already exist.",
  };
}

// ---------------------------------------------------------------------------
// Withdrawal fee
// ---------------------------------------------------------------------------

/** A count from an RPC payload, whichever key the function chose to return. */
function payloadCount(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

const SCOPE_SENTENCE: Record<FeeApplyScope, string> = {
  FUTURE: "new requests only",
  PENDING: "pending requests only",
  BOTH: "pending requests and new requests",
};

/**
 * Saves the flat withdrawal fee and decides what it applies to.
 *
 * The amount arrives from the browser as integer cents, is re-validated here,
 * and is written by `admin_update_withdrawal_fee` — the customer-facing forms
 * never send a fee, and `request_withdrawal` reads the stored fee itself, so a
 * tampered request cannot choose its own fee. Postgres owns the rest: it only
 * rewrites rows that are still PENDING, which is what keeps completed and
 * rejected withdrawals untouched no matter what `p_apply_to` says.
 */
export async function updateWithdrawalFeeAction(input: {
  feeCents: number;
  feeReason: string;
  applyTo: FeeApplyScope;
}): Promise<AdminActionResult> {
  const parsed = withdrawalFeeSchema.safeParse({
    feeCents: Math.round(Number(input.feeCents)),
    feeReason: input.feeReason ?? "",
    applyTo: input.applyTo,
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_update_withdrawal_fee", {
    p_fee_cents: parsed.data.feeCents,
    p_fee_reason: parsed.data.feeReason || null,
    p_apply_to: parsed.data.applyTo,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("INVALID_FEE") || message.includes("INVALID_FEE_AMOUNT")) {
      return { ok: false, message: "That fee amount is not accepted. Use a flat amount of $0 or more." };
    }
    if (message.includes("INVALID_APPLY_TO") || message.includes("INVALID_SCOPE")) {
      return { ok: false, message: "Choose Future, Pending or Both, then save again." };
    }
    if (message.includes("INVALID_FEE_REASON")) {
      return { ok: false, message: "Add a short reason customers will see for this fee." };
    }
    return failure(error, "The withdrawal fee was not saved.");
  }

  refreshConsole();

  const payload = (data ?? {}) as Record<string, unknown>;
  const updated = payloadCount(payload, [
    "updatedPending",
    "updated_pending",
    "pendingUpdated",
    "pending_updated",
    "updatedCount",
    "updated_count",
    "pendingCount",
  ]);

  const amount = formatUSD(parsed.data.feeCents);
  const reason = parsed.data.feeReason ? ` — “${parsed.data.feeReason}”` : "";

  const applied =
    parsed.data.applyTo === "PENDING"
      ? updated === null
        ? " Pending requests were updated."
        : ` ${updated} pending request${updated === 1 ? "" : "s"} updated.`
      : parsed.data.applyTo === "BOTH"
        ? updated === null
          ? " Pending requests were updated too."
          : ` ${updated} pending request${updated === 1 ? "" : "s"} updated as well.`
        : "";

  return {
    ok: true,
    message: `Withdrawal fee set to ${amount}${reason} for ${SCOPE_SENTENCE[parsed.data.applyTo]}.${applied}`,
  };
}

// ---------------------------------------------------------------------------
// Withdrawals and ledger maintenance
// ---------------------------------------------------------------------------

export async function resolveWithdrawalAction(input: {
  transactionId: string;
  outcome: "COMPLETED" | "FAILED";
  reason?: string;
}): Promise<AdminActionResult> {
  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_resolve_withdrawal", {
    p_transaction_id: input.transactionId,
    p_outcome: input.outcome,
    p_reason: input.reason ?? null,
  });

  if (error) {
    if ((error.message ?? "").includes("WITHDRAWAL_ALREADY_RESOLVED")) {
      return { ok: false, message: "That withdrawal has already been resolved." };
    }
    if ((error.message ?? "").includes("WITHDRAWAL_NOT_FOUND")) {
      return { ok: false, message: "That withdrawal no longer exists." };
    }
    return failure(error, "That decision did not go through.");
  }

  refreshConsole();

  const refunded = Number((data as Record<string, unknown> | null)?.refundedCents ?? 0);

  return {
    ok: true,
    message:
      input.outcome === "COMPLETED"
        ? "Withdrawal marked completed."
        : refunded > 0
          ? "Withdrawal failed and the hold was released back to the balance."
          : "Withdrawal failed.",
  };
}

export async function deleteTransactionAction(transactionId: string): Promise<AdminActionResult> {
  if (!transactionId) return { ok: false, message: "That transaction no longer exists." };

  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_delete_transaction", {
    p_transaction_id: transactionId,
  });

  if (error) {
    if ((error.message ?? "").includes("TRANSACTION_NOT_FOUND")) {
      return { ok: false, message: "That transaction no longer exists." };
    }
    return failure(error, "That row was not deleted.");
  }

  refreshConsole();

  const payload = (data ?? {}) as Record<string, unknown>;
  const released = Number(payload.releasedCents ?? 0);

  return {
    ok: true,
    message:
      released > 0
        ? `${payload.reference ?? "Transaction"} deleted — ${formatUSD(released)} released back to the user.`
        : `${payload.reference ?? "Transaction"} deleted from the ledger.`,
  };
}

export async function clearTransactionsAction(input: {
  scope: "ALL" | "SETTLED";
}): Promise<AdminActionResult> {
  const parsed = clearTransactionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const { data, error } = await gate.supabase.rpc("admin_clear_transactions", {
    p_scope: parsed.data.scope,
  });

  if (error) return failure(error, "The ledger was not cleared.");

  refreshConsole();

  const payload = (data ?? {}) as Record<string, unknown>;
  const deleted = Number(payload.deletedCount ?? 0);
  const released = Number(payload.releasedCents ?? 0);
  const freed = Number(payload.freedCodes ?? 0);

  if (deleted === 0) return { ok: true, message: "There was nothing to clear." };

  const parts = [`${deleted} ledger row${deleted === 1 ? "" : "s"} deleted`];
  if (released > 0) parts.push(`${formatUSD(released)} of pending holds released`);
  if (freed > 0) parts.push(`${freed} deposit code${freed === 1 ? "" : "s"} freed up`);

  return { ok: true, message: `${parts.join(" · ")}.` };
}

// ---------------------------------------------------------------------------
// Demo roster
// ---------------------------------------------------------------------------

/**
 * Creates the sandbox roster.
 *
 * Auth users can only be created with the service-role key, which must stay on
 * the server. When the key is absent this returns the honest answer instead of
 * pretending: run `supabase/seed.sql` once, or register the accounts normally.
 */
export async function seedDemoAccountsAction(): Promise<AdminActionResult> {
  const gate = await requireAdminClient();
  if ("blocked" in gate) return gate.blocked;

  const supabase = gate.supabase;

  const { data: existing } = await supabase.from("profiles").select("username");
  const taken = new Set((existing ?? []).map((row) => String(row.username)));
  const missing = DEMO_ACCOUNTS.filter((account) => !taken.has(account.username));

  if (missing.length === 0) {
    return { ok: true, message: "Demo profiles already exist — nothing to create." };
  }

  const url = supabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    return {
      ok: false,
      message:
        "Creating demo accounts needs the server-only SUPABASE_SERVICE_ROLE_KEY, or run supabase/seed.sql in the Supabase SQL editor once.",
    };
  }

  // Server-only client: it never leaves this action and is never sent to the
  // browser. It exists purely to create confirmed auth users.
  const admin = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let created = 0;

  for (const account of missing) {
    const { data: userData, error: createError } = await admin.auth.admin.createUser({
      email: `${account.username}@demo.fairmoney`,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { username: account.username, display_name: account.displayName },
    });

    if (createError || !userData.user) continue;
    created += 1;

    if (account.balanceCents > 0) {
      await supabase.rpc("admin_credit", {
        p_user_id: userData.user.id,
        p_amount_cents: account.balanceCents,
        p_note: "Seeded test balance",
      });
    }
  }

  refreshConsole();

  return created > 0
    ? {
        ok: true,
        message: `Created ${created} demo profile${created === 1 ? "" : "s"} (password “${DEMO_PASSWORD}”).`,
      }
    : { ok: false, message: "No demo profiles were created. Check the Supabase auth settings." };
}


