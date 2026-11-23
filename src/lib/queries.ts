import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TransactionKind =
  | "TRANSFER"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "WELCOME_BONUS"
  | "ADMIN_CREDIT"
  | "ADMIN_RESET";
export type TransactionState = "COMPLETED" | "PENDING" | "FAILED";

export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  avatarUpdatedAt: Date | null;
};

export type ActivityItem = {
  id: string;
  reference: string;
  direction: "in" | "out";
  type: TransactionKind;
  status: TransactionState;
  counterparty: PublicProfile | null;
  amountCents: number;
  feeCents: number;
  note: string | null;
  destination: string | null;
  depositCode: string | null;
  failureReason: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  balanceAfterCents: number | null;
};

const profileSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarHue: true,
  avatar: { select: { updatedAt: true } },
} as const;

type ProfileRow = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  avatar: { updatedAt: Date } | null;
};

function toPublicProfile(row: ProfileRow): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarHue: row.avatarHue,
    avatarUpdatedAt: row.avatar?.updatedAt ?? null,
  };
}

export type ActivityFilter = "all" | "transfers" | "deposits" | "withdrawals";

/**
 * One person's ledger feed: money in, money out and any declined attempts, in a
 * single chronological list. `direction` is derived from which side of the row
 * the viewer sits on, never from anything the client sends.
 */
export async function getActivity(
  userId: string,
  options: { limit?: number; filter?: ActivityFilter } = {},
): Promise<ActivityItem[]> {
  const { limit = 12, filter = "all" } = options;

  const filterWhere: Prisma.TransactionWhereInput =
    filter === "transfers"
      ? { type: "TRANSFER" }
      : filter === "deposits"
        ? { type: "DEPOSIT" }
        : filter === "withdrawals"
          ? { type: "WITHDRAWAL" }
          : {};

  const rows = await prisma.transaction.findMany({
    where: { AND: [{ OR: [{ senderId: userId }, { recipientId: userId }] }, filterWhere] },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      sender: { select: profileSelect },
      recipient: { select: profileSelect },
      depositCode: { select: { code: true } },
    },
  });

  return rows.map((row) => {
    const outgoing = row.senderId === userId && row.recipientId !== userId;
    const other = outgoing ? row.recipient : row.sender;
    const counterparty = other && other.id !== userId ? toPublicProfile(other) : null;

    return {
      id: row.id,
      reference: row.reference,
      direction: outgoing ? ("out" as const) : ("in" as const),
      type: row.type as TransactionKind,
      status: row.status as TransactionState,
      counterparty,
      amountCents: row.amountCents,
      feeCents: row.feeCents,
      note: row.note,
      destination: row.destination,
      depositCode: row.depositCode?.code ?? null,
      failureReason: row.failureReason,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      balanceAfterCents: outgoing ? row.senderBalanceAfterCents : row.recipientBalanceAfterCents,
    };
  });
}

export type WalletSummary = {
  balanceCents: number;
  moneyInCents: number;
  moneyOutCents: number;
  transferCount: number;
  depositCount: number;
  pendingWithdrawalCents: number;
  pendingWithdrawalCount: number;
  declinedCount: number;
};

export async function getWalletSummary(userId: string, balanceCents: number): Promise<WalletSummary> {
  const [inflow, sentTransfers, withdrawals, pending, declined, transfers, deposits] =
    await Promise.all([
      prisma.transaction.aggregate({
        where: {
          recipientId: userId,
          status: "COMPLETED",
          type: { in: ["TRANSFER", "DEPOSIT", "ADMIN_CREDIT"] },
        },
        _sum: { amountCents: true },
      }),
      prisma.transaction.aggregate({
        where: { senderId: userId, status: "COMPLETED", type: "TRANSFER" },
        _sum: { amountCents: true },
      }),
      prisma.transaction.aggregate({
        where: { senderId: userId, type: "WITHDRAWAL", status: { in: ["PENDING", "COMPLETED"] } },
        _sum: { amountCents: true },
      }),
      prisma.transaction.aggregate({
        where: { senderId: userId, type: "WITHDRAWAL", status: "PENDING" },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      prisma.transaction.count({ where: { senderId: userId, status: "FAILED" } }),
      prisma.transaction.count({ where: { senderId: userId, type: "TRANSFER", status: "COMPLETED" } }),
      prisma.transaction.count({
        where: { recipientId: userId, type: "DEPOSIT", status: "COMPLETED" },
      }),
    ]);

  return {
    balanceCents,
    moneyInCents: inflow._sum.amountCents ?? 0,
    moneyOutCents: (sentTransfers._sum.amountCents ?? 0) + (withdrawals._sum.amountCents ?? 0),
    transferCount: transfers,
    depositCount: deposits,
    pendingWithdrawalCents: pending._sum.amountCents ?? 0,
    pendingWithdrawalCount: pending._count._all,
    declinedCount: declined,
  };
}

/** People you have exchanged money with, most recent first. */
export async function getRecentContacts(userId: string, limit = 5): Promise<PublicProfile[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      status: "COMPLETED",
      type: "TRANSFER",
      OR: [{ senderId: userId }, { recipientId: userId }],
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      sender: { select: profileSelect },
      recipient: { select: profileSelect },
    },
  });

  const seen = new Map<string, PublicProfile>();
  for (const row of rows) {
    const other = row.senderId === userId ? row.recipient : row.sender;
    if (!other || other.id === userId || seen.has(other.username)) continue;
    seen.set(other.username, toPublicProfile(other));
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Admin portal queries
// ---------------------------------------------------------------------------

export async function getAdminOverview() {
  const [userCount, txCount, totals, declined, pending, moved] = await Promise.all([
    prisma.user.count(),
    prisma.transaction.count(),
    prisma.user.aggregate({ _sum: { balanceCents: true } }),
    prisma.transaction.count({ where: { status: "FAILED" } }),
    prisma.transaction.aggregate({
      where: { type: "WITHDRAWAL", status: "PENDING" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: { status: "COMPLETED", type: "TRANSFER" },
      _sum: { amountCents: true },
    }),
  ]);

  return {
    userCount,
    txCount,
    declined,
    totalBalanceCents: totals._sum.balanceCents ?? 0,
    movedCents: moved._sum.amountCents ?? 0,
    pendingWithdrawalCents: pending._sum.amountCents ?? 0,
    pendingWithdrawalCount: pending._count._all,
  };
}

export async function getAdminUsers(search?: string) {
  const term = search?.trim().replace(/^@+/, "").toLowerCase() ?? "";

  return prisma.user.findMany({
    where: term
      ? {
          OR: [
            { username: { contains: term } },
            { displayName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ isAdmin: "desc" }, { balanceCents: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      isAdmin: true,
      balanceCents: true,
      avatarHue: true,
      createdAt: true,
      avatar: { select: { updatedAt: true } },
      _count: { select: { sent: true, received: true } },
    },
  });
}

export type AdminTransactionFilter =
  | "all"
  | "transfers"
  | "deposits"
  | "withdrawals"
  | "pending"
  | "declined";

export async function getAdminTransactions(filter: AdminTransactionFilter = "all", limit = 40) {
  const where: Prisma.TransactionWhereInput | undefined =
    filter === "transfers"
      ? { type: "TRANSFER", status: "COMPLETED" }
      : filter === "deposits"
        ? { type: "DEPOSIT" }
        : filter === "withdrawals"
          ? { type: "WITHDRAWAL" }
          : filter === "pending"
            ? { status: "PENDING" }
            : filter === "declined"
              ? { status: "FAILED" }
              : undefined;

  return prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      sender: { select: profileSelect },
      recipient: { select: profileSelect },
      depositCode: { select: { code: true } },
    },
  });
}

/** Pending simulated withdrawals awaiting an admin decision. */
export async function getPendingWithdrawals(limit = 25) {
  return prisma.transaction.findMany({
    where: { type: "WITHDRAWAL", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      sender: { select: profileSelect },
      resolver: { select: profileSelect },
    },
  });
}

export async function getDepositCodes(limit = 40) {
  return prisma.depositCode.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      createdBy: { select: { username: true } },
      _count: { select: { transactions: true } },
    },
  });
}

/** Row counts behind the console's ledger-clear control. */
export async function getTransactionCounts() {
  const [total, settled, pending] = await Promise.all([
    prisma.transaction.count(),
    prisma.transaction.count({ where: { status: { in: ["COMPLETED", "FAILED"] } } }),
    prisma.transaction.aggregate({
      where: { type: "WITHDRAWAL", status: "PENDING" },
      _sum: { amountCents: true, feeCents: true },
      _count: { _all: true },
    }),
  ]);

  return {
    total,
    settled,
    pendingCount: pending._count._all,
    pendingHeldCents: (pending._sum.amountCents ?? 0) + (pending._sum.feeCents ?? 0),
  };
}


