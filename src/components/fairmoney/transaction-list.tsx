import React from 'react';

import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Clock,
  Landmark,
  Plus,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/fairmoney/avatar";
import { Badge } from "@/components/ui/badge";
import { formatShortDateTime } from "@/lib/datetime";
import { formatUSD } from "@/lib/money";
import type { ActivityItem, TransactionKind, TransactionState } from "@/lib/data/queries";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<TransactionKind, string> = {
  TRANSFER: "Transfer",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  WELCOME_BONUS: "Opening balance",
  ADMIN_CREDIT: "Balance adjustment",
  ADMIN_RESET: "Balance reset",
};

function titleFor(item: ActivityItem): string {
  if (item.type === "TRANSFER" && item.counterparty) return item.counterparty.displayName;
  if (item.type === "DEPOSIT") return "Deposit";
  if (item.type === "WITHDRAWAL") return "Withdrawal";
  return TYPE_LABELS[item.type];
}

function subtitleFor(item: ActivityItem, outgoing: boolean): string {
  if (item.type === "TRANSFER" && item.counterparty) {
    return `${outgoing ? "To" : "From"} @${item.counterparty.username} · Transfer`;
  }
  if (item.type === "DEPOSIT") {
    return item.depositCode ? `Deposit code ${item.depositCode} · Deposit` : "Deposit";
  }
  if (item.type === "WITHDRAWAL") {
    return item.destination ? `To ${item.destination}` : "Withdrawal";
  }
  return TYPE_LABELS[item.type];
}

const STATE_STYLES: Record<TransactionState, { label: string; className: string }> = {
  COMPLETED: {
    label: "Completed",
    className: "border-emerald-600/25 bg-emerald-50 text-emerald-700",
  },
  PENDING: { label: "Pending", className: "border-amber-500/30 bg-amber-50 text-amber-700" },
  FAILED: { label: "Failed", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

function StatusChip({ status }: { status: TransactionState }) {
  const style = STATE_STYLES[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em]",
        style.className,
      )}
    >
      {status === "PENDING" ? <Clock className="h-3.5 w-3.5" /> : null}
      {status === "FAILED" ? <XCircle className="h-3.5 w-3.5" /> : null}
      {style.label}
    </Badge>
  );
}

function LeadingIcon({ item }: { item: ActivityItem }) {
  if (item.counterparty) {
    return (
      <Avatar
        displayName={item.counterparty.displayName}
        hue={item.counterparty.avatarHue}
        username={item.counterparty.username}
        avatarUpdatedAt={item.counterparty.avatarUpdatedAt}
      />
    );
  }

  const tone =
    item.type === "DEPOSIT"
      ? "bg-accent text-primary"
      : item.type === "WITHDRAWAL"
        ? "bg-fm-ink text-fm-lime"
        : "bg-secondary text-muted-foreground";

  const Icon =
    item.type === "DEPOSIT"
      ? Banknote
      : item.type === "WITHDRAWAL"
        ? Landmark
        : item.type === "ADMIN_CREDIT" || item.type === "ADMIN_RESET"
          ? SlidersHorizontal
          : item.direction === "out"
            ? ArrowUpRight
            : ArrowDownLeft;

  return (
    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", tone)}>
      <Icon className="h-[19px] w-[19px]" strokeWidth={2.1} />
    </span>
  );
}

export function TransactionRow({
  item,
  showBalance = false,
}: {
  item: ActivityItem;
  showBalance?: boolean;
}) {
  const outgoing = item.direction === "out";

  return (
    <li className="fm-row">
      <LeadingIcon item={item} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-display text-[15px] font-semibold leading-snug text-foreground">
            {titleFor(item)}
          </p>
          <p
            className={cn(
              "fm-numeric shrink-0 font-display text-[15px] font-semibold",
              item.status === "FAILED"
                ? "text-muted-foreground line-through decoration-1"
                : outgoing
                  ? "text-foreground"
                  : "text-primary",
            )}
          >
            {item.status === "FAILED" ? "" : outgoing ? "−" : "+"}
            {formatUSD(item.amountCents)}
          </p>
        </div>

        <p className="mt-1.5 truncate text-[13px] text-muted-foreground">
          {subtitleFor(item, outgoing)}
        </p>

        {item.type === "WITHDRAWAL" ? (
          <div className="mt-1.5 space-y-1">
            <p className="fm-numeric text-[12.5px] text-muted-foreground">
              Requested <span className="font-semibold text-foreground">{formatUSD(item.amountCents)}</span>
              <span className="px-1.5 text-muted-foreground/50">·</span>
              Fee {item.feeCents > 0 ? formatUSD(item.feeCents) : "none"}
            </p>
            {item.feeCents > 0 && item.feeReason ? (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Fee reason: {item.feeReason}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusChip status={item.status} />
          <span className="text-[12px] text-muted-foreground">
            {formatShortDateTime(item.createdAt)}
          </span>
        </div>

        <p className="fm-numeric mt-2 font-mono text-[11px] tracking-[0.04em] text-muted-foreground/85">
          Transaction ID {item.reference}
        </p>

        {item.note && item.type !== "DEPOSIT" ? (
          <p className="mt-1.5 truncate text-[12.5px] italic text-muted-foreground">“{item.note}”</p>
        ) : null}

        {showBalance && item.balanceAfterCents !== null ? (
          <p className="fm-numeric mt-1.5 text-[12.5px] text-muted-foreground">
            Balance after {formatUSD(item.balanceAfterCents)}
          </p>
        ) : null}

        {item.status === "FAILED" && item.failureReason ? (
          <p className="mt-1.5 text-[12.5px] text-destructive">{item.failureReason}</p>
        ) : null}
      </div>
    </li>
  );
}

export function TransactionList({
  items,
  emptyHint,
  showBalance = false,
}: {
  items: ActivityItem[];
  emptyHint?: React.ReactNode;
  showBalance?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="font-display text-[16px] font-semibold text-foreground">No transactions yet</p>
        <p className="mx-auto mt-2 max-w-xs text-[13.5px] leading-relaxed text-muted-foreground">
          {emptyHint ?? "Send money to another @username or add funds with a deposit code."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/app/deposit" className="fm-btn fm-btn-primary px-5">
            <Plus className="h-4 w-4" />
            Add money
          </Link>
          <Link href="/app/send" className="fm-btn fm-btn-ghost px-5">
            Send money
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/70 px-3">
      {items.map((item) => (
        <TransactionRow key={item.id} item={item} showBalance={showBalance} />
      ))}
    </ul>
  );
}
