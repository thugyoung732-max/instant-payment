"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { hashPassword, requireAdmin } from "@/lib/auth";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { formatUSD as formatUsd } from "@/lib/money";
import {
  clearTransactions,
  creditSandboxMoney,
  deleteTransaction,
  makeReference,
  resetSandboxBalance,
  resolveWithdrawal,
} from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import {
  adminCodeSchema,
  adminCreditSchema,
  clearTransactionsSchema,
  firstIssue,
} from "@/lib/validation";

export type AdminActionResult = { ok: boolean; message: string };

function revalidateAdmin(): void {
  revalidatePath("/admin");
  revalidatePath("/app");
  revalidatePath("/app/activity");
  revalidatePath("/app/deposit");
  revalidatePath("/app/withdraw");
}

export async function adminCreditAction(input: {
  userId: string;
  amountCents: number;
  note?: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();

  const parsed = adminCreditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { username: true },
  });
  if (!target) return { ok: false, message: "That profile no longer exists." };

  const { balanceCents } = await creditSandboxMoney({
    userId: parsed.data.userId,
    amountCents: parsed.data.amountCents,
    type: "ADMIN_CREDIT",
    note: parsed.data.note || `Balance adjustment by @${admin.username}`,
  });

  revalidateAdmin();

  return {
    ok: true,
    message: `Adjusted @${target.username} — new balance ${(balanceCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    })}.`,
  };
}

export async function adminResetBalanceAction(userId: string): Promise<AdminActionResult> {
  const admin = await requireAdmin();

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!target) return { ok: false, message: "That profile no longer exists." };

  const { clearedCents } = await resetSandboxBalance({ userId, actorId: admin.id });

  revalidateAdmin();

  return {
    ok: true,
    message: `Reset @${target.username}, clearing ${(clearedCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    })}.`,
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
  const admin = await requireAdmin();

  const parsed = adminCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { code, creditCents, label, singleUse } = parsed.data;
  // Single-use codes are simply a cap of one redemption.
  const maxUses = singleUse ? 1 : (parsed.data.maxUses ?? null);

  try {
    await prisma.depositCode.create({
      data: {
        code,
        creditCents,
        label: label || null,
        singleUse,
        maxUses,
        createdById: admin.id,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: `Code ${code} already exists.` };
    }
    throw error;
  }

  revalidateAdmin();

  return {
    ok: true,
    message: `Code ${code} created — credits ${(creditCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    })}${maxUses === null ? " (unlimited uses)" : ` (${maxUses} use${maxUses === 1 ? "" : "s"})`}.`,
  };
}

export async function setDepositCodeActiveAction(
  codeId: string,
  active: boolean,
): Promise<AdminActionResult> {
  await requireAdmin();

  const code = await prisma.depositCode.findUnique({
    where: { id: codeId },
    select: { code: true },
  });
  if (!code) return { ok: false, message: "That code no longer exists." };

  await prisma.depositCode.update({ where: { id: codeId }, data: { active } });
  revalidateAdmin();

  return { ok: true, message: `${code.code} ${active ? "re-activated" : "deactivated"}.` };
}

export async function deleteDepositCodeAction(codeId: string): Promise<AdminActionResult> {
  await requireAdmin();

  const code = await prisma.depositCode.findUnique({
    where: { id: codeId },
    select: { code: true, _count: { select: { transactions: true } } },
  });
  if (!code) return { ok: false, message: "That code no longer exists." };

  // Codes that funded a deposit stay in the ledger for audit; deactivate instead.
  if (code._count.transactions > 0) {
    await prisma.depositCode.update({ where: { id: codeId }, data: { active: false } });
    revalidateAdmin();
    return {
      ok: true,
      message: `${code.code} has ${code._count.transactions} redemption(s) on record, so it was deactivated instead of deleted.`,
    };
  }

  await prisma.depositCode.delete({ where: { id: codeId } });
  revalidateAdmin();

  return { ok: true, message: `${code.code} deleted.` };
}

export async function seedDepositCodesAction(): Promise<AdminActionResult> {
  const admin = await requireAdmin();

  const samples = [
    { code: "ABC123", creditCents: 50_000, label: "Welcome deposit", singleUse: true, maxUses: 1 },
    { code: "TESTER25", creditCents: 2_500, label: "QA allowance", singleUse: false, maxUses: 10 },
    { code: "PAYDAY500", creditCents: 50_000, label: "Campaign top-up", singleUse: false, maxUses: 5 },
  ];

  let created = 0;
  for (const sample of samples) {
    const exists = await prisma.depositCode.findUnique({
      where: { code: sample.code },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.depositCode.create({ data: { ...sample, createdById: admin.id } });
    created += 1;
  }

  revalidateAdmin();

  return created > 0
    ? { ok: true, message: `Created ${created} sample deposit code${created === 1 ? "" : "s"}.` }
    : { ok: true, message: "Sample deposit codes already exist." };
}

// ---------------------------------------------------------------------------
// Simulated withdrawals
// ---------------------------------------------------------------------------

export async function resolveWithdrawalAction(input: {
  transactionId: string;
  outcome: "COMPLETED" | "FAILED";
  reason?: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();

  const result = await resolveWithdrawal({
    transactionId: input.transactionId,
    outcome: input.outcome,
    actorId: admin.id,
    reason: input.reason,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidateAdmin();

  return {
    ok: true,
    message:
      input.outcome === "COMPLETED"
        ? "Withdrawal marked completed."
        : result.refundedCents > 0
          ? "Withdrawal failed and the hold was released back to the balance."
          : "Withdrawal failed.",
  };
}

// ---------------------------------------------------------------------------
// Ledger maintenance
// ---------------------------------------------------------------------------

/**
 * Deletes one ledger row. Settled rows are pure history, so removing them never
 * moves money; a pending withdrawal releases its hold first so the user's money
 * is never stranded behind a record that no longer exists.
 */
export async function deleteTransactionAction(transactionId: string): Promise<AdminActionResult> {
  await requireAdmin();

  if (!transactionId) return { ok: false, message: "That transaction no longer exists." };

  const result = await deleteTransaction(transactionId);
  if (!result.ok) return { ok: false, message: result.message };

  revalidateAdmin();

  return {
    ok: true,
    message:
      result.releasedCents > 0
        ? `${result.reference} deleted — ${formatUsd(result.releasedCents)} released back to the user.`
        : `${result.reference} deleted from the ledger.`,
  };
}

/**
 * Empties the ledger: every completed and failed row, or everything including
 * requests still awaiting review (whose holds are released first).
 */
export async function clearTransactionsAction(input: {
  scope: "ALL" | "SETTLED";
}): Promise<AdminActionResult> {
  await requireAdmin();

  const parsed = clearTransactionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const result = await clearTransactions(parsed.data.scope);
  revalidateAdmin();

  if (result.deletedCount === 0) return { ok: true, message: "There was nothing to clear." };

  const parts = [
    `${result.deletedCount} ledger row${result.deletedCount === 1 ? "" : "s"} deleted`,
  ];
  if (result.releasedCents > 0) {
    parts.push(`${formatUsd(result.releasedCents)} of pending holds released`);
  }
  if (result.freedCodes > 0) {
    parts.push(
      `${result.freedCodes} deposit code${result.freedCodes === 1 ? "" : "s"} freed up`,
    );
  }

  return { ok: true, message: `${parts.join(" · ")}.` };
}

// ---------------------------------------------------------------------------
// Demo roster
// ---------------------------------------------------------------------------

/**
 * Creates a small set of demo profiles so transfers and search have realistic
 * counterparts. Explicit admin action only — nothing here runs on signup.
 */
export async function seedDemoAccountsAction(): Promise<AdminActionResult> {
  await requireAdmin();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let created = 0;

  for (const account of DEMO_ACCOUNTS) {
    const exists = await prisma.user.findUnique({
      where: { username: account.username },
      select: { id: true },
    });
    if (exists) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: `${account.username}@demo.fairmoney`,
            username: account.username,
            displayName: account.displayName,
            passwordHash,
            avatarHue: (account.username.length * 37) % 360,
            balanceCents: account.balanceCents,
          },
          select: { id: true, balanceCents: true },
        });

        await tx.transaction.create({
          data: {
            reference: makeReference("ADJ"),
            type: "ADMIN_CREDIT",
            status: "COMPLETED",
            amountCents: account.balanceCents,
            note: "Seeded test balance",
            recipientId: user.id,
            recipientBalanceAfterCents: user.balanceCents,
          },
        });
      });
      created += 1;
    } catch {
      // A duplicate raced in; nothing to do.
    }
  }

  revalidateAdmin();

  return created > 0
    ? {
        ok: true,
        message: `Created ${created} demo profile${created === 1 ? "" : "s"} (password “${DEMO_PASSWORD}”).`,
      }
    : { ok: true, message: "Demo profiles already exist — nothing to create." };
}
