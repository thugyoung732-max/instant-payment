/**
 * Row → domain mapping.
 *
 * Postgres columns are snake_case, timestamps are ISO strings and money is a
 * bigint that arrives as a JSON number (or string, depending on the row width).
 * Everything is normalised here, once, so the screens keep working with the
 * integer-cent, camelCase shapes they were written for.
 */

import type {
  ChatSettingsRecord,
  DepositCodeRecord,
  Profile,
  PublicProfile,
  TransactionRecord,
  TransactionStatus,
  TransactionType,
  WithdrawalFeeSettings,
} from "./types";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function cents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") return Math.round(Number(value));
  return 0;
}

function nullableCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return cents(value);
}

function date(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function nullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = date(value);
  return parsed.getTime() === 0 ? null : parsed;
}

export function mapProfile(row: Row): Profile {
  const avatarUpdatedAt = nullableDate(row.avatar_updated_at);

  return {
    id: text(row.id),
    email: text(row.email),
    username: text(row.username),
    displayName: text(row.display_name),
    avatarHue: cents(row.avatar_hue) || 156,
    isAdmin: Boolean(row.is_admin),
    balanceCents: cents(row.balance_cents),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    avatar: avatarUpdatedAt ? { updatedAt: avatarUpdatedAt } : null,
    avatarDataUrl: nullableText(row.avatar_data_url),
  };
}

export function mapPublicProfile(row: Row): PublicProfile {
  return {
    id: text(row.id),
    username: text(row.username),
    displayName: text(row.display_name),
    avatarHue: cents(row.avatar_hue) || 156,
    avatarUpdatedAt: nullableDate(row.avatar_updated_at),
  };
}

export function mapTransaction(row: Row): TransactionRecord {
  return {
    id: text(row.id),
    reference: text(row.reference),
    type: text(row.type) as TransactionType,
    status: text(row.status) as TransactionStatus,
    amountCents: cents(row.amount_cents),
    feeCents: cents(row.fee_cents),
    feeReason: nullableText(row.fee_reason),
    note: nullableText(row.note),
    destination: nullableText(row.destination),
    failureReason: nullableText(row.failure_reason),
    senderId: nullableText(row.sender_id),
    recipientId: nullableText(row.recipient_id),
    senderBalanceAfterCents: nullableCents(row.sender_balance_after_cents),
    recipientBalanceAfterCents: nullableCents(row.recipient_balance_after_cents),
    depositCodeId: nullableText(row.deposit_code_id),
    resolvedAt: nullableDate(row.resolved_at),
    resolvedById: nullableText(row.resolved_by),
    createdAt: date(row.created_at),
  };
}

export function mapDepositCode(row: Row): DepositCodeRecord {
  return {
    id: text(row.id),
    code: text(row.code),
    label: nullableText(row.label),
    creditCents: cents(row.credit_cents),
    active: Boolean(row.active),
    singleUse: Boolean(row.single_use),
    maxUses: row.max_uses === null || row.max_uses === undefined ? null : cents(row.max_uses),
    uses: cents(row.uses),
    lastUsedAt: nullableDate(row.last_used_at),
    createdById: nullableText(row.created_by),
    createdAt: date(row.created_at),
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A handle, or null when the value is really an id (e.g. `updated_by`). */
function handleOnly(value: unknown): string | null {
  const text = nullableText(value);
  if (!text || UUID_PATTERN.test(text)) return null;
  return text.replace(/^@+/, "") || null;
}

function firstValue(row: Row, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

/**
 * Normalises the withdrawal-fee configuration.
 *
 * The same row reaches us three different ways — a table read (`fee_cents`), a
 * jsonb RPC payload (`feeCents`), or a payload that nests the settings under a
 * `settings`/`fee` key — so every shape is accepted here instead of in each
 * caller. `null` means "no recognizable fee came back", which the callers show
 * as a configuration notice rather than pretending the fee is zero.
 */
export function mapWithdrawalFeeSettings(payload: unknown): WithdrawalFeeSettings | null {
  if (!payload || typeof payload !== "object") return null;

  const outer = payload as Row;
  const nested = [outer.settings, outer.fee, outer.configuration].find(
    (value) => value && typeof value === "object",
  );
  const row = (nested ? { ...outer, ...(nested as Row) } : outer) as Row;

  const rawFee = firstValue(row, ["feeCents", "fee_cents", "feeAmountCents", "fee_amount_cents"]);
  if (rawFee === undefined) return null;

  return {
    feeCents: Math.max(0, cents(rawFee)),
    feeReason: nullableText(firstValue(row, ["feeReason", "fee_reason", "reason"])) ?? "",
    updatedAt: nullableDate(
      firstValue(row, ["updatedAt", "updated_at", "lastUpdatedAt", "last_updated_at"]),
    ),
    // A raw `updated_by` uuid is not a handle: when the RPC is unavailable and
    // the settings table is read directly, showing "@3f2a-…" would be worse than
    // showing nothing at all.
    updatedByUsername: handleOnly(
      firstValue(row, [
        "updatedByUsername",
        "updated_by_username",
        "updatedBy",
        "updated_by",
        "lastUpdatedBy",
      ]),
    ),
  };
}

export function mapChatSettings(row: Row | null): ChatSettingsRecord & {
  secondaryKey: string | null;
  customScriptUrl: string | null;
} {
  return {
    id: "default",
    enabled: Boolean(row?.enabled),
    provider: text(row?.provider) || "smartsupp",
    primaryKey: nullableText(row?.public_key),
    secondaryKey: nullableText(row?.secondary_key),
    customScriptUrl: nullableText(row?.custom_script_url),
    accentColor: text(row?.accent_color) || "#0f8a5f",
    position: text(row?.position) || "right",
    welcomeMessage: nullableText(row?.welcome_message),
  };
}
