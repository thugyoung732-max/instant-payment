"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, requireUser } from "@/lib/auth";
import { findDestination, maskIdentifier } from "@/lib/destinations";
import {
  depositWithCode,
  requestWithdrawal,
  transferFunds,
  type DepositResult,
  type TransferResult,
  type WithdrawalResult,
} from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import {
  depositSchema,
  firstIssue,
  normaliseUsername,
  USERNAME_PATTERN,
  withdrawalSchema,
} from "@/lib/validation";

export type RecipientLookup =
  | {
      status: "found";
      username: string;
      displayName: string;
      avatarHue: number;
      avatarUpdatedAt: string | null;
    }
  | {
      status: "self";
      username: string;
      displayName: string;
      avatarHue: number;
      avatarUpdatedAt: string | null;
    }
  | { status: "missing"; username: string }
  | { status: "invalid"; username: string };

function revalidateWallet(): void {
  revalidatePath("/app");
  revalidatePath("/app/activity");
  revalidatePath("/app/send");
  revalidatePath("/app/deposit");
  revalidatePath("/app/withdraw");
  revalidatePath("/app/profile");
  revalidatePath("/admin");
}

/**
 * Recipient lookup used by the send flow. A user's own handle is reported
 * distinctly so the UI can explain the self-transfer rule before submission.
 */
export async function lookupRecipient(rawUsername: string): Promise<RecipientLookup> {
  const me = await getCurrentUser();
  const username = normaliseUsername(rawUsername ?? "");

  if (!USERNAME_PATTERN.test(username)) return { status: "invalid", username };

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarHue: true,
      avatar: { select: { updatedAt: true } },
    },
  });

  if (!user) return { status: "missing", username };

  const profile = {
    username: user.username,
    displayName: user.displayName,
    avatarHue: user.avatarHue,
    avatarUpdatedAt: user.avatar?.updatedAt.toISOString() ?? null,
  };

  if (me && user.id === me.id) return { status: "self", ...profile };
  return { status: "found", ...profile };
}

export async function sendMoneyAction(input: {
  recipientUsername: string;
  amountCents: number;
  note?: string;
}): Promise<TransferResult> {
  const me = await requireUser();

  const result = await transferFunds({
    senderId: me.id,
    recipientUsername: normaliseUsername(input.recipientUsername ?? ""),
    amountCents: Math.round(Number(input.amountCents)),
    note: input.note,
  });

  if (result.ok) revalidateWallet();

  return result;
}

/**
 * Redeems a deposit code. The credited amount is read from the code row on the
 * server — any amount sent by the browser is informational only.
 */
export async function depositAction(input: {
  code: string;
  amountCents?: number;
}): Promise<DepositResult> {
  const me = await requireUser();

  const parsed = depositSchema.safeParse({
    code: input.code ?? "",
    amountCents: Number.isFinite(input.amountCents)
      ? Math.round(Number(input.amountCents))
      : undefined,
  });
  if (!parsed.success) {
    return { ok: false, code: "INVALID_CODE", message: firstIssue(parsed.error) };
  }

  const result = await depositWithCode({
    userId: me.id,
    code: parsed.data.code,
    declaredAmountCents: parsed.data.amountCents ?? null,
  });

  if (result.ok) revalidateWallet();

  return result;
}

/**
 * Submits a withdrawal request. Holds the amount plus the server-resolved fee
 * and opens a pending row for review in the operations console.
 */
export async function withdrawAction(input: {
  amountCents: number;
  destinationId: string;
  accountName: string;
  identifier: string;
}): Promise<WithdrawalResult> {
  const me = await requireUser();

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

  // The stored destination is assembled server-side, with long numbers masked.
  const destinationLabel = `${destination.label} · ${parsed.data.accountName.trim()} · ${maskIdentifier(
    parsed.data.identifier,
    destination.kind,
  )}`;

  const result = await requestWithdrawal({
    userId: me.id,
    amountCents: parsed.data.amountCents,
    destination: destinationLabel,
  });

  if (result.ok) revalidateWallet();

  return result;
}
