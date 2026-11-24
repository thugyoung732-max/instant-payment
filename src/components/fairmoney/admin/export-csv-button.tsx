"use client";
import React from 'react';

import { Download } from "lucide-react";
import { toast } from "sonner";

import { formatLongDateTime } from "@/lib/datetime";
import type { AdminTransactionRow, AdminUserRow } from "@/lib/data/queries";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Audit export.
 *
 * The rows arrive from the server component that rendered the console, already
 * filtered by Row Level Security for an administrator session, so the browser
 * only formats what it was allowed to read. Same columns, same filenames as the
 * original server-side export.
 */
export function ExportCsvButton(
  props: { scope: "profiles"; profiles: AdminUserRow[] } | { scope: "ledger"; transactions: AdminTransactionRow[] },
) {
  function download() {
    const lines: string[] = [];
    const stamp = new Date().toISOString().slice(0, 10);

    if (props.scope === "profiles") {
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

      for (const user of [...props.profiles].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )) {
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
          "fee_reason",
          "debited_usd",
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

      const rows = [...props.transactions].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );

      for (const row of rows.slice(0, 5000)) {
        lines.push(
          [
            row.reference,
            row.type,
            row.status,
            (row.amountCents / 100).toFixed(2),
            (row.feeCents / 100).toFixed(2),
            row.feeReason ?? "",
            // The fee is never debited, so what left the wallet is always the
            // requested amount — never amount + fee.
            (row.amountCents / 100).toFixed(2),
            "USD",
            row.sender?.username ?? "",
            "",
            row.recipient?.username ?? "",
            "",
            row.destination ?? "",
            row.depositCode?.code ?? "",
            row.failureReason ?? "",
            row.senderBalanceAfterCents === null
              ? ""
              : (row.senderBalanceAfterCents / 100).toFixed(2),
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

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `instant-payment-audit-${props.scope}-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    toast.success(`${props.scope === "profiles" ? "Profiles" : "Ledger"} exported.`);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-2 rounded-full border border-fm-lime/30 bg-fm-lime/12 px-4 py-2 font-display text-[12.5px] font-semibold text-fm-lime transition-colors hover:bg-fm-lime/20"
    >
      <Download className="h-3.5 w-3.5" />
      Export {props.scope === "profiles" ? "profiles" : "ledger"} CSV
    </button>
  );
}
