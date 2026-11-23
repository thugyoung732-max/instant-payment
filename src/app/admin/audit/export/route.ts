import { type NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { formatLongDateTime } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";

/**
 * Audit export: the full ledger as CSV for reconciliation, spreadsheets and
 * offline review. Admin-only, read-only, and bounded to 5,000 rows per export.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: NextRequest) {
  await requireAdmin();

  const scope = request.nextUrl.searchParams.get("scope") ?? "ledger";
  const rows = await prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      sender: { select: { username: true, email: true } },
      recipient: { select: { username: true, email: true } },
      depositCode: { select: { code: true } },
      resolver: { select: { username: true } },
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  if (scope === "profiles") {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        username: true,
        displayName: true,
        email: true,
        balanceCents: true,
        isAdmin: true,
        createdAt: true,
        avatar: { select: { updatedAt: true } },
        _count: { select: { sent: true, received: true } },
      },
    });

    lines.push(
      [
        "username",
        "display_name",
        "email",
        "balance_usd",
        "role",
        "has_profile_picture",
        "transactions_sent",
        "transactions_received",
        "joined_at",
      ].join(","),
    );

    for (const user of users) {
      lines.push(
        [
          user.username,
          user.displayName,
          user.email,
          (user.balanceCents / 100).toFixed(2),
          user.isAdmin ? "admin" : "customer",
          user.avatar ? "yes" : "no",
          user._count.sent,
          user._count.received,
          user.createdAt.toISOString(),
        ]
          .map(csvCell)
          .join(","),
      );
    }
  } else {
    lines.push(
      [
        "transaction_id",
        "type",
        "status",
        "amount_usd",
        "fee_usd",
        "total_usd",
        "currency",
        "sender_username",
        "sender_email",
        "recipient_username",
        "recipient_email",
        "destination",
        "deposit_code",
        "failure_reason",
        "sender_balance_after_usd",
        "recipient_balance_after_usd",
        "created_at",
        "created_at_utc_label",
        "resolved_at",
        "reviewed_by",
      ].join(","),
    );

    for (const row of rows) {
      lines.push(
        [
          row.reference,
          row.type,
          row.status,
          (row.amountCents / 100).toFixed(2),
          (row.feeCents / 100).toFixed(2),
          ((row.amountCents + row.feeCents) / 100).toFixed(2),
          "USD",
          row.sender?.username ?? "",
          row.sender?.email ?? "",
          row.recipient?.username ?? "",
          row.recipient?.email ?? "",
          row.destination ?? "",
          row.depositCode?.code ?? "",
          row.failureReason ?? "",
          row.senderBalanceAfterCents === null ? "" : (row.senderBalanceAfterCents / 100).toFixed(2),
          row.recipientBalanceAfterCents === null
            ? ""
            : (row.recipientBalanceAfterCents / 100).toFixed(2),
          row.createdAt.toISOString(),
          formatLongDateTime(row.createdAt),
          row.resolvedAt ? row.resolvedAt.toISOString() : "",
          row.resolver?.username ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  const filename = `instant-payment-audit-${scope}-${stamp}.csv`;

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store, max-age=0",
    },
  });
}
