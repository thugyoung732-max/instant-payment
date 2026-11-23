import "server-only";

import type { Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid";

import { prisma } from "@/lib/prisma";

const newSuffix = customAlphabet("0123456789ABCDEFGHJKMNPQRSTVWXYZ", 10);

export type ReferencePrefix = "TRF" | "DEP" | "WDR" | "ADJ";

/** Human-readable ledger reference, e.g. "TRF-4KQ7ZP2N8D". */
export function makeReference(prefix: ReferencePrefix = "TRF"): string {
  return `${prefix}-${newSuffix()}`;
}

class InsufficientFundsError extends Error {
  constructor() {
    super("INSUFFICIENT_FUNDS");
    this.name = "InsufficientFundsError";
  }
}

class CodeProblemError extends Error {
  constructor(public reason: "INVALID_CODE" | "CODE_EXHAUSTED") {
    super(reason);
    this.name = "CodeProblemError";
  }
}

function isRetryableWriteConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

/** Retries a serializable transaction on a Postgres write conflict. */
async function withRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (isRetryableWriteConflict(error) && attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("unreachable");
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export type TransferFailureCode =
  | "SELF_TRANSFER"
  | "RECIPIENT_NOT_FOUND"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_AMOUNT"
  | "UNAUTHENTICATED"
  | "BUSY";

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
  | { ok: false; code: TransferFailureCode; message: string };

const TRANSFER_MESSAGES: Record<TransferFailureCode, string> = {
  SELF_TRANSFER: "You can't send money to your own account.",
  RECIPIENT_NOT_FOUND: "We couldn't find that @username.",
  INSUFFICIENT_FUNDS: "Your available balance is too low for this transfer.",
  INVALID_AMOUNT: "Enter an amount above $0.00.",
  UNAUTHENTICATED: "Your session expired. Sign in again to continue.",
  BUSY: "Another transaction is settling right now. Try again in a second.",
};

function transferFailure(code: TransferFailureCode): TransferResult {
  return { ok: false, code, message: TRANSFER_MESSAGES[code] };
}

/**
 * Transfers between two profiles.
 *
 * The whole movement happens in ONE serializable Postgres transaction: re-read
 * the authenticated sender, reject self-transfers and non-positive amounts,
 * debit with a conditional UPDATE (balance check and debit are the same
 * statement, so a race cannot overdraw), credit the recipient, then record the
 * ledger row with both resulting balances. The browser never supplies a balance,
 * and a failure rolls everything back.
 */
export async function transferFunds(params: {
  senderId: string;
  recipientUsername: string;
  amountCents: number;
  note?: string;
}): Promise<TransferResult> {
  const { senderId, recipientUsername, amountCents } = params;
  const note = params.note?.trim() ? params.note.trim().slice(0, 120) : null;

  if (!Number.isInteger(amountCents) || amountCents <= 0) return transferFailure("INVALID_AMOUNT");
  if (!senderId) return transferFailure("UNAUTHENTICATED");

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { id: true, username: true },
  });
  if (!sender) return transferFailure("UNAUTHENTICATED");

  const recipient = await prisma.user.findUnique({
    where: { username: recipientUsername },
    select: { id: true, username: true, displayName: true, avatarHue: true },
  });
  if (!recipient) return transferFailure("RECIPIENT_NOT_FOUND");
  if (recipient.id === sender.id) return transferFailure("SELF_TRANSFER");

  try {
    return await withRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const debited = await tx.user.updateMany({
            where: { id: sender.id, balanceCents: { gte: amountCents } },
            data: { balanceCents: { decrement: amountCents } },
          });
          if (debited.count !== 1) throw new InsufficientFundsError();

          const senderAfter = await tx.user.findUniqueOrThrow({
            where: { id: sender.id },
            select: { balanceCents: true },
          });
          const recipientAfter = await tx.user.update({
            where: { id: recipient.id },
            data: { balanceCents: { increment: amountCents } },
            select: { balanceCents: true },
          });

          const ledger = await tx.transaction.create({
            data: {
              reference: makeReference("TRF"),
              type: "TRANSFER",
              status: "COMPLETED",
              amountCents,
              note,
              senderId: sender.id,
              recipientId: recipient.id,
              senderBalanceAfterCents: senderAfter.balanceCents,
              recipientBalanceAfterCents: recipientAfter.balanceCents,
            },
            select: { reference: true, createdAt: true },
          });

          return {
            ok: true as const,
            reference: ledger.reference,
            amountCents,
            note,
            createdAt: ledger.createdAt.toISOString(),
            senderBalanceAfterCents: senderAfter.balanceCents,
            recipient: {
              username: recipient.username,
              displayName: recipient.displayName,
              avatarHue: recipient.avatarHue,
            },
          };
        },
        { isolationLevel: "Serializable", timeout: 10_000 },
      ),
    );
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      await logDeclined({
        type: "TRANSFER",
        senderId: sender.id,
        recipientId: recipient.id,
        amountCents,
        note,
        reason: TRANSFER_MESSAGES.INSUFFICIENT_FUNDS,
      });
      return transferFailure("INSUFFICIENT_FUNDS");
    }
    throw error;
  }
}

/**
 * Declined attempts are written outside the rolled-back transaction on purpose:
 * the audit trail must survive, and a failed row must never touch balances.
 */
async function logDeclined(params: {
  type: "TRANSFER" | "DEPOSIT" | "WITHDRAWAL";
  senderId?: string | null;
  recipientId?: string | null;
  amountCents: number;
  note?: string | null;
  destination?: string | null;
  reason: string;
}): Promise<void> {
  try {
    await prisma.transaction.create({
      data: {
        reference: makeReference(
          params.type === "DEPOSIT" ? "DEP" : params.type === "WITHDRAWAL" ? "WDR" : "TRF",
        ),
        type: params.type,
        status: "FAILED",
        amountCents: params.amountCents,
        note: params.note ?? null,
        destination: params.destination ?? null,
        failureReason: params.reason,
        senderId: params.senderId ?? null,
        recipientId: params.recipientId ?? null,
      },
    });
  } catch {
    // Ledger housekeeping must never surface as a user-facing error.
  }
}

// ---------------------------------------------------------------------------
// Deposits — funded only by internally managed sandbox codes
// ---------------------------------------------------------------------------

export type DepositFailureCode =
  | "INVALID_CODE"
  | "CODE_EXHAUSTED"
  | "INVALID_AMOUNT"
  | "UNAUTHENTICATED"
  | "BUSY";

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
  | { ok: false; code: DepositFailureCode; message: string };

const DEPOSIT_MESSAGES: Record<DepositFailureCode, string> = {
  INVALID_CODE: "That deposit code isn't recognised.",
  CODE_EXHAUSTED: "That deposit code has already been used.",
  INVALID_AMOUNT: "Enter an amount above $0.00.",
  UNAUTHENTICATED: "Your session expired. Sign in again to continue.",
  BUSY: "Another deposit is settling right now. Try again in a second.",
};

/**
 * Redeems an internally provisioned deposit code.
 *
 * The credited amount comes from the CODE ROW, never from the request body —
 * typing a larger amount in the browser changes nothing. Capacity is claimed
 * with a conditional UPDATE inside the same transaction that credits the
 * balance, so a single-use code cannot be redeemed twice, even concurrently.
 *
 * There is no payment provider, card, bank or network call anywhere in this
 * function: the funds are simulated bookkeeping only.
 */
export async function depositWithCode(params: {
  userId: string;
  code: string;
  declaredAmountCents?: number | null;
}): Promise<DepositResult> {
  const code = params.code.trim().toUpperCase();
  const declaredCents =
    typeof params.declaredAmountCents === "number" && params.declaredAmountCents > 0
      ? Math.round(params.declaredAmountCents)
      : null;

  if (!params.userId) {
    return { ok: false, code: "UNAUTHENTICATED", message: DEPOSIT_MESSAGES.UNAUTHENTICATED };
  }

  try {
    return await withRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const record = await tx.depositCode.findUnique({
            where: { code },
            select: {
              id: true,
              code: true,
              label: true,
              creditCents: true,
              active: true,
              maxUses: true,
              uses: true,
            },
          });

          if (!record || !record.active) throw new CodeProblemError("INVALID_CODE");
          if (record.maxUses !== null && record.uses >= record.maxUses) {
            throw new CodeProblemError("CODE_EXHAUSTED");
          }

          const claim = await tx.depositCode.updateMany({
            where: {
              id: record.id,
              active: true,
              ...(record.maxUses === null ? {} : { uses: { lt: record.maxUses } }),
            },
            data: { uses: { increment: 1 }, lastUsedAt: new Date() },
          });
          if (claim.count !== 1) throw new CodeProblemError("CODE_EXHAUSTED");

          const after = await tx.user.update({
            where: { id: params.userId },
            data: { balanceCents: { increment: record.creditCents } },
            select: { balanceCents: true },
          });

          const ledger = await tx.transaction.create({
            data: {
              reference: makeReference("DEP"),
              type: "DEPOSIT",
              status: "COMPLETED",
              amountCents: record.creditCents,
              note: record.label ? `Deposit · ${record.label}` : `Deposit code ${record.code}`,
              recipientId: params.userId,
              recipientBalanceAfterCents: after.balanceCents,
              depositCodeId: record.id,
            },
            select: { reference: true, createdAt: true },
          });

          return {
            ok: true as const,
            reference: ledger.reference,
            creditedCents: record.creditCents,
            declaredCents,
            balanceAfterCents: after.balanceCents,
            code: record.code,
            codeLabel: record.label,
            createdAt: ledger.createdAt.toISOString(),
          };
        },
        { isolationLevel: "Serializable", timeout: 10_000 },
      ),
    );
  } catch (error) {
    if (error instanceof CodeProblemError) {
      await logDeclined({
        type: "DEPOSIT",
        recipientId: params.userId,
        amountCents: declaredCents ?? 0,
        reason: DEPOSIT_MESSAGES[error.reason],
      });
      return { ok: false, code: error.reason, message: DEPOSIT_MESSAGES[error.reason] };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Withdrawals — SIMULATION ONLY
// ---------------------------------------------------------------------------

export type WithdrawalFailureCode =
  | "INSUFFICIENT_FUNDS"
  | "INVALID_AMOUNT"
  | "INVALID_DESTINATION"
  | "UNAUTHENTICATED"
  | "BUSY";

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
  | { ok: false; code: WithdrawalFailureCode; message: string };

const WITHDRAWAL_MESSAGES: Record<WithdrawalFailureCode, string> = {
  INSUFFICIENT_FUNDS: "Your available balance is too low for this withdrawal.",
  INVALID_AMOUNT: "Enter an amount above $0.00.",
  INVALID_DESTINATION: "Add the destination account details.",
  UNAUTHENTICATED: "Your session expired. Sign in again to continue.",
  BUSY: "Another transaction is settling right now. Try again in a second.",
};

/**
 * Submits a simulated withdrawal.
 *
 * The amount is held (debited) against the balance so the same funds cannot be
 * requested twice while the request sits in review, and a PENDING ledger row is
 * written. NOTHING is disbursed: there is no bank, card or payment provider
 * integration in this application, and resolving the request in the admin
 * console only flips a database status (a failed request refunds the hold).
 */
export async function requestWithdrawal(params: {
  userId: string;
  amountCents: number;
  destination: string;
  note?: string | null;
}): Promise<WithdrawalResult> {
  const { userId, amountCents } = params;
  const destination = params.destination.trim().slice(0, 160);
  const note = params.note?.trim() ? params.note.trim().slice(0, 120) : null;

  if (!userId) {
    return { ok: false, code: "UNAUTHENTICATED", message: WITHDRAWAL_MESSAGES.UNAUTHENTICATED };
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, code: "INVALID_AMOUNT", message: WITHDRAWAL_MESSAGES.INVALID_AMOUNT };
  }
  if (destination.length < 4) {
    return { ok: false, code: "INVALID_DESTINATION", message: WITHDRAWAL_MESSAGES.INVALID_DESTINATION };
  }

  const sender = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!sender) {
    return { ok: false, code: "UNAUTHENTICATED", message: WITHDRAWAL_MESSAGES.UNAUTHENTICATED };
  }

  // No fee is charged. The hold covers exactly the amount requested and
  // nothing else, so the balance falls by the payout alone.
  const feeCents = 0;
  const totalCents = amountCents;

  try {
    return await withRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const held = await tx.user.updateMany({
            where: { id: sender.id, balanceCents: { gte: totalCents } },
            data: { balanceCents: { decrement: totalCents } },
          });
          if (held.count !== 1) throw new InsufficientFundsError();

          const after = await tx.user.findUniqueOrThrow({
            where: { id: sender.id },
            select: { balanceCents: true },
          });

          const ledger = await tx.transaction.create({
            data: {
              reference: makeReference("WDR"),
              type: "WITHDRAWAL",
              status: "PENDING",
              amountCents,
              feeCents,
              note,
              destination,
              senderId: sender.id,
              senderBalanceAfterCents: after.balanceCents,
            },
            select: { reference: true, createdAt: true },
          });

          return {
            ok: true as const,
            reference: ledger.reference,
            amountCents,
            feeCents,
            totalCents,
            destination,
            balanceAfterCents: after.balanceCents,
            createdAt: ledger.createdAt.toISOString(),
          };
        },
        { isolationLevel: "Serializable", timeout: 10_000 },
      ),
    );
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      await logDeclined({
        type: "WITHDRAWAL",
        senderId: sender.id,
        amountCents: totalCents,
        destination,
        reason: WITHDRAWAL_MESSAGES.INSUFFICIENT_FUNDS,
      });
      return { ok: false, code: "INSUFFICIENT_FUNDS", message: WITHDRAWAL_MESSAGES.INSUFFICIENT_FUNDS };
    }
    throw error;
  }
}

/** Marks a pending simulated withdrawal completed or failed (refunding a hold). */
export async function resolveWithdrawal(params: {
  transactionId: string;
  outcome: "COMPLETED" | "FAILED";
  actorId: string;
  reason?: string;
}): Promise<
  { ok: true; status: "COMPLETED" | "FAILED"; refundedCents: number } | { ok: false; message: string }
> {
  const { transactionId, outcome, actorId } = params;

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const row = await tx.transaction.findUnique({
        where: { id: transactionId },
        select: {
          id: true,
          type: true,
          status: true,
          amountCents: true,
          feeCents: true,
          senderId: true,
          reference: true,
        },
      });

      if (!row || row.type !== "WITHDRAWAL") {
        return { ok: false as const, message: "That withdrawal no longer exists." };
      }
      if (row.status !== "PENDING") {
        return {
          ok: false as const,
          message: `Withdrawal ${row.reference} is already ${row.status.toLowerCase()}.`,
        };
      }

      let refundedCents = 0;
      let balanceAfter: number | null = null;

      if (outcome === "FAILED" && row.senderId) {
        // The hold covered the payout plus its fee, so both are released.
        const released = row.amountCents + row.feeCents;
        const refunded = await tx.user.update({
          where: { id: row.senderId },
          data: { balanceCents: { increment: released } },
          select: { balanceCents: true },
        });
        refundedCents = released;
        balanceAfter = refunded.balanceCents;
      }

      await tx.transaction.update({
        where: { id: row.id },
        data: {
          status: outcome,
          resolvedAt: new Date(),
          resolvedBy: actorId,
          failureReason: outcome === "FAILED" ? (params.reason ?? "Withdrawal declined") : null,
          ...(outcome === "FAILED" && balanceAfter !== null
            ? { senderBalanceAfterCents: balanceAfter }
            : {}),
        },
      });

      return { ok: true as const, status: outcome, refundedCents };
    }),
  );
}

// ---------------------------------------------------------------------------
// Admin sandbox adjustments
// ---------------------------------------------------------------------------

/** Sandbox balance adjustment (admin top-up or reset). Never a real payment. */
export async function creditSandboxMoney(params: {
  userId: string;
  amountCents: number;
  type: "WELCOME_BONUS" | "ADMIN_CREDIT" | "ADMIN_RESET";
  note?: string | null;
}): Promise<{ reference: string; balanceCents: number }> {
  const { userId, amountCents, type } = params;
  const note = params.note?.trim() ? params.note.trim().slice(0, 120) : null;

  return prisma.$transaction(async (tx) => {
    const after = await tx.user.update({
      where: { id: userId },
      data: { balanceCents: { increment: amountCents } },
      select: { balanceCents: true },
    });

    const ledger = await tx.transaction.create({
      data: {
        reference: makeReference("ADJ"),
        type,
        status: "COMPLETED",
        amountCents,
        note,
        recipientId: userId,
        recipientBalanceAfterCents: after.balanceCents,
      },
      select: { reference: true },
    });

    return { reference: ledger.reference, balanceCents: after.balanceCents };
  });
}

/**
 * Resets a profile's balance to zero, logging the exact amount removed so the
 * ledger still accounts for it. History is never deleted.
 */
export async function resetSandboxBalance(params: {
  userId: string;
  actorId: string;
  note?: string | null;
}): Promise<{ clearedCents: number; balanceCents: number }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: params.userId },
      select: { balanceCents: true },
    });
    const clearedCents = current?.balanceCents ?? 0;

    const after = await tx.user.update({
      where: { id: params.userId },
      data: { balanceCents: 0 },
      select: { balanceCents: true },
    });

    await tx.transaction.create({
      data: {
        reference: makeReference("ADJ"),
        type: "ADMIN_RESET",
        status: "COMPLETED",
        amountCents: clearedCents,
        note: params.note?.trim() ? params.note.trim().slice(0, 120) : "Balance reset by admin",
        senderId: params.actorId,
        recipientId: params.userId,
        recipientBalanceAfterCents: after.balanceCents,
      },
    });

    return { clearedCents, balanceCents: after.balanceCents };
  });
}

// ---------------------------------------------------------------------------
// Ledger maintenance (operations console)
// ---------------------------------------------------------------------------

type LedgerRowForDeletion = {
  type: string;
  status: string;
  amountCents: number;
  feeCents: number;
  senderId: string | null;
  depositCodeId: string | null;
};

/**
 * Gives back the money a PENDING withdrawal was holding. Every other row holds
 * nothing: balances live on the user, not on the ledger, so deleting settled
 * history never moves a cent.
 */
async function releaseWithdrawalHold(
  tx: Prisma.TransactionClient,
  row: LedgerRowForDeletion,
): Promise<number> {
  if (row.type !== "WITHDRAWAL" || row.status !== "PENDING" || !row.senderId) return 0;

  const held = row.amountCents + row.feeCents;
  await tx.user.update({
    where: { id: row.senderId },
    data: { balanceCents: { increment: held } },
  });
  return held;
}

/**
 * Keeps issued deposit codes consistent with the ledger: once the redemption
 * rows are gone the code is no longer "used", so a single-use code becomes
 * usable again instead of looking spent with no history behind it.
 */
async function releaseDepositCodeUses(
  tx: Prisma.TransactionClient,
  depositCodeId: string | null,
  count: number,
): Promise<void> {
  if (!depositCodeId || count <= 0) return;

  const code = await tx.depositCode.findUnique({
    where: { id: depositCodeId },
    select: { uses: true },
  });
  if (!code) return;

  const uses = Math.max(0, code.uses - count);
  await tx.depositCode.update({
    where: { id: depositCodeId },
    data: { uses, ...(uses === 0 ? { lastUsedAt: null } : {}) },
  });
}

export type DeleteTransactionResult =
  | { ok: true; reference: string; releasedCents: number }
  | { ok: false; message: string };

/**
 * Removes one ledger row — the console's delete for tidying history.
 *
 * A settled row can go without touching any balance. A PENDING withdrawal is
 * different: its amount and fee are held out of the user's balance, so the hold
 * is released before the row is removed, otherwise the money would disappear
 * along with the record.
 */
export async function deleteTransaction(transactionId: string): Promise<DeleteTransactionResult> {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.transaction.findUnique({
        where: { id: transactionId },
        select: {
          id: true,
          reference: true,
          type: true,
          status: true,
          amountCents: true,
          feeCents: true,
          senderId: true,
          depositCodeId: true,
        },
      });

      if (!row) return { ok: false as const, message: "That transaction no longer exists." };

      const releasedCents = await releaseWithdrawalHold(tx, row);
      await tx.transaction.delete({ where: { id: row.id } });
      await releaseDepositCodeUses(tx, row.depositCodeId, 1);

      return { ok: true as const, reference: row.reference, releasedCents };
    },
    { timeout: 15_000 },
  );
}

export type ClearTransactionsScope = "ALL" | "SETTLED";

export type ClearTransactionsResult = {
  deletedCount: number;
  releasedCents: number;
  freedCodes: number;
};

/**
 * Empties the ledger in one pass.
 *
 * `SETTLED` clears completed and failed rows only, leaving withdrawals that are
 * still awaiting review — and the money they hold — exactly where they are.
 * `ALL` clears everything, releasing every pending hold first so no balance is
 * left short by a request that no longer exists.
 */
export async function clearTransactions(
  scope: ClearTransactionsScope,
): Promise<ClearTransactionsResult> {
  const where: Prisma.TransactionWhereInput =
    scope === "ALL" ? {} : { status: { in: ["COMPLETED", "FAILED"] } };

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.transaction.findMany({
        where,
        select: {
          type: true,
          status: true,
          amountCents: true,
          feeCents: true,
          senderId: true,
          depositCodeId: true,
        },
      });

      if (rows.length === 0) return { deletedCount: 0, releasedCents: 0, freedCodes: 0 };

      // Holds first, aggregated per user so each balance moves once.
      const holdsByUser = new Map<string, number>();
      let releasedCents = 0;
      for (const row of rows) {
        if (row.type !== "WITHDRAWAL" || row.status !== "PENDING" || !row.senderId) continue;
        const held = row.amountCents + row.feeCents;
        holdsByUser.set(row.senderId, (holdsByUser.get(row.senderId) ?? 0) + held);
        releasedCents += held;
      }
      for (const [userId, held] of holdsByUser) {
        await tx.user.update({
          where: { id: userId },
          data: { balanceCents: { increment: held } },
        });
      }

      const codeUses = new Map<string, number>();
      for (const row of rows) {
        if (!row.depositCodeId) continue;
        codeUses.set(row.depositCodeId, (codeUses.get(row.depositCodeId) ?? 0) + 1);
      }
      for (const [codeId, count] of codeUses) {
        await releaseDepositCodeUses(tx, codeId, count);
      }

      const deleted = await tx.transaction.deleteMany({ where });

      return { deletedCount: deleted.count, releasedCents, freedCodes: codeUses.size };
    },
    { timeout: 30_000 },
  );
}
