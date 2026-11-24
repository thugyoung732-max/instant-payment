import "server-only";

import {
  mapAccountWithdrawalFee,
  mapChatSettings,
  mapDepositCode,
  mapProfile,
  mapPublicProfile,
  mapTransaction,
  mapWithdrawalFeeSettings,
} from "./mappers";
import type {
  AccountWithdrawalFee,
  AdminAccountOption,
  ChatSettingsRecord,
  DepositCodeRecord,
  Profile,
  PublicProfile,
  TransactionRecord,
  TransactionStatus,
  TransactionType,
  WithdrawalFeeSettings,
} from "./types";
import { createClient } from "@/lib/supabase/server";

/**
 * Read models for the wallet screens and the operations console.
 *
 * Every function is a server-side read under the caller's own session, so Row
 * Level Security decides what comes back: a customer receives their own ledger
 * and the public projection of other profiles, while the console receives the
 * full picture because `profiles.is_admin` is true for that session.
 *
 * The shapes are unchanged from the localStorage era, which is why the screens
 * kept their markup.
 */

export type TransactionKind = TransactionType;
export type TransactionState = TransactionStatus;

export type ActivityItem = {
  id: string;
  reference: string;
  direction: "in" | "out";
  type: TransactionKind;
  status: TransactionState;
  counterparty: PublicProfile | null;
  amountCents: number;
  feeCents: number;
  /** Reason the admin gave for the flat withdrawal fee, stored with the request. */
  feeReason: string | null;
  note: string | null;
  destination: string | null;
  depositCode: string | null;
  failureReason: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  balanceAfterCents: number | null;
};

export type ActivityFilter = "all" | "transfers" | "deposits" | "withdrawals";

async function profilesById(): Promise<Map<string, PublicProfile>> {
  const supabase = await createClient();
  const { data } = await supabase.from("public_profiles").select("*");
  const map = new Map<string, PublicProfile>();
  for (const row of data ?? []) {
    const profile = mapPublicProfile(row);
    map.set(profile.id, profile);
  }
  return map;
}

async function depositCodesForRead(): Promise<Map<string, { code: string }>> {
  const supabase = await createClient();
  const { data } = await supabase.from("my_deposit_codes").select("id, code");
  const map = new Map<string, { code: string }>();
  for (const row of data ?? []) {
    map.set(String(row.id), { code: String(row.code) });
  }
  return map;
}

/**
 * One person's ledger feed: money in, money out and any declined attempts, in a
 * single chronological list. `direction` is derived from which side of the row
 * the viewer sits on.
 */
export async function getActivity(
  userId: string,
  options: { limit?: number; filter?: ActivityFilter } = {},
): Promise<ActivityItem[]> {
  const { limit = 12, filter = "all" } = options;
  const supabase = await createClient();

  let query = supabase
    .from("transactions")
    .select("*")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);

  if (filter === "transfers") query = query.eq("type", "TRANSFER");
  if (filter === "deposits") query = query.eq("type", "DEPOSIT");
  if (filter === "withdrawals") query = query.eq("type", "WITHDRAWAL");

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];

  const rows = data.map(mapTransaction);
  const [people, codes] = await Promise.all([profilesById(), depositCodesForRead()]);

  return rows.map((row) => {
    const outgoing = row.senderId === userId && row.recipientId !== userId;
    const counterpartyId = outgoing ? row.recipientId : row.senderId;
    const other = counterpartyId ? (people.get(counterpartyId) ?? null) : null;

    return {
      id: row.id,
      reference: row.reference,
      direction: outgoing ? ("out" as const) : ("in" as const),
      type: row.type,
      status: row.status,
      counterparty: other && other.id !== userId ? other : null,
      amountCents: row.amountCents,
      feeCents: row.feeCents,
      feeReason: row.feeReason,
      note: row.note,
      destination: row.destination,
      depositCode: row.depositCodeId ? (codes.get(row.depositCodeId)?.code ?? null) : null,
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

export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  const supabase = await createClient();

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("balance_cents").eq("id", userId).maybeSingle(),
    supabase
      .from("transactions")
      .select("*")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`),
  ]);

  const ledger = (rows ?? []).map(mapTransaction);

  const inflow = ledger
    .filter(
      (row) =>
        row.recipientId === userId &&
        row.status === "COMPLETED" &&
        (row.type === "TRANSFER" || row.type === "DEPOSIT" || row.type === "ADMIN_CREDIT"),
    )
    .reduce((sum, row) => sum + row.amountCents, 0);

  const sentTransfers = ledger
    .filter(
      (row) => row.senderId === userId && row.status === "COMPLETED" && row.type === "TRANSFER",
    )
    .reduce((sum, row) => sum + row.amountCents, 0);

  const withdrawals = ledger
    .filter(
      (row) =>
        row.senderId === userId &&
        row.type === "WITHDRAWAL" &&
        (row.status === "PENDING" || row.status === "COMPLETED"),
    )
    .reduce((sum, row) => sum + row.amountCents, 0);

  const pending = ledger.filter(
    (row) => row.senderId === userId && row.type === "WITHDRAWAL" && row.status === "PENDING",
  );

  return {
    balanceCents: profile?.balance_cents ? Number(profile.balance_cents) : 0,
    moneyInCents: inflow,
    moneyOutCents: sentTransfers + withdrawals,
    transferCount: ledger.filter(
      (row) => row.senderId === userId && row.type === "TRANSFER" && row.status === "COMPLETED",
    ).length,
    depositCount: ledger.filter(
      (row) => row.recipientId === userId && row.type === "DEPOSIT" && row.status === "COMPLETED",
    ).length,
    pendingWithdrawalCents: pending.reduce((sum, row) => sum + row.amountCents, 0),
    pendingWithdrawalCount: pending.length,
    declinedCount: ledger.filter((row) => row.senderId === userId && row.status === "FAILED")
      .length,
  };
}

/** People you have exchanged money with, most recent first. */
export async function getRecentContacts(userId: string, limit = 5): Promise<PublicProfile[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("transactions")
    .select("sender_id, recipient_id, created_at")
    .eq("status", "COMPLETED")
    .eq("type", "TRANSFER")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(40);

  if (!data?.length) return [];

  const people = await profilesById();
  const seen = new Map<string, PublicProfile>();

  for (const row of data) {
    const otherId = row.sender_id === userId ? row.recipient_id : row.sender_id;
    if (!otherId || otherId === userId) continue;
    const person = people.get(String(otherId));
    if (!person || seen.has(person.username)) continue;
    seen.set(person.username, person);
    if (seen.size >= limit) break;
  }

  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Admin console
// ---------------------------------------------------------------------------

export async function getAdminOverview() {
  const supabase = await createClient();

  const [{ count: userCount }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("transactions").select("*"),
  ]);

  const ledger = (rows ?? []).map(mapTransaction);
  const pending = ledger.filter((row) => row.type === "WITHDRAWAL" && row.status === "PENDING");

  const { data: balances } = await supabase.from("profiles").select("balance_cents");
  const totalBalanceCents = (balances ?? []).reduce(
    (sum, row) => sum + Number(row.balance_cents ?? 0),
    0,
  );

  return {
    userCount: userCount ?? 0,
    txCount: ledger.length,
    declined: ledger.filter((row) => row.status === "FAILED").length,
    totalBalanceCents,
    movedCents: ledger
      .filter((row) => row.status === "COMPLETED" && row.type === "TRANSFER")
      .reduce((sum, row) => sum + row.amountCents, 0),
    pendingWithdrawalCents: pending.reduce((sum, row) => sum + row.amountCents, 0),
    pendingWithdrawalCount: pending.length,
  };
}

export type AdminUserRow = Profile & {
  _count: { sent: number; received: number };
};

export async function getAdminUsers(search?: string): Promise<AdminUserRow[]> {
  const supabase = await createClient();

  const { data: profileRows, error } = await supabase.from("profiles").select("*");
  if (error || !profileRows) return [];

  const term = search?.trim().replace(/^@+/, "").toLowerCase() ?? "";
  const profiles = profileRows
    .map(mapProfile)
    .filter((profile) =>
      term
        ? profile.username.includes(term) ||
          profile.displayName.toLowerCase().includes(term) ||
          profile.email.toLowerCase().includes(term)
        : true,
    )
    .sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      if (a.balanceCents !== b.balanceCents) return b.balanceCents - a.balanceCents;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 60);

  const { data: txRows } = await supabase.from("transactions").select("sender_id, recipient_id");
  const sent = new Map<string, number>();
  const received = new Map<string, number>();
  for (const row of txRows ?? []) {
    if (row.sender_id) sent.set(String(row.sender_id), (sent.get(String(row.sender_id)) ?? 0) + 1);
    if (row.recipient_id)
      received.set(String(row.recipient_id), (received.get(String(row.recipient_id)) ?? 0) + 1);
  }

  return profiles.map((profile) => ({
    ...profile,
    _count: {
      sent: sent.get(profile.id) ?? 0,
      received: received.get(profile.id) ?? 0,
    },
  }));
}

function toAccountOption(profile: Profile): AdminAccountOption {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    email: profile.email,
    isAdmin: profile.isAdmin,
    balanceCents: profile.balanceCents,
  };
}

/**
 * Accounts matching a console search, for the per-account fee picker.
 *
 * This deliberately reuses `getAdminUsers` — the console's one user-list data
 * source — so handle, display-name and email matching (plus the admin-first
 * ordering) stay identical to the Profiles tab instead of drifting apart.
 */
export async function searchAdminAccounts(
  term = "",
  limit = 8,
): Promise<AdminAccountOption[]> {
  const users = await getAdminUsers(term);
  return users.slice(0, limit).map(toAccountOption);
}

/** One account, without pulling the whole user list, for the selected card. */
export async function getAdminAccount(userId: string): Promise<AdminAccountOption | null> {
  if (!userId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toAccountOption(mapProfile(data));
}

/**
 * One account's effective withdrawal fee.
 *
 * `admin_get_account_withdrawal_fee` is admin-gated in Postgres and resolves the
 * override-or-default itself, so the console never guesses which fee applies.
 * `null` means the read failed (or the function is missing) and the panel shows
 * a notice rather than inventing a figure.
 */
export async function getAccountWithdrawalFee(
  userId: string,
): Promise<AccountWithdrawalFee | null> {
  if (!userId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_account_withdrawal_fee", {
    p_user_id: userId,
  });

  if (error) return null;
  return mapAccountWithdrawalFee(data);
}

export type AdminTransactionFilter =
  | "all"
  | "transfers"
  | "deposits"
  | "withdrawals"
  | "pending"
  | "declined";

/** Console rows keep the `avatar.updatedAt` nesting the tables were written for. */
export type AdminProfile = PublicProfile & { avatar: { updatedAt: Date } | null };

export type AdminTransactionRow = TransactionRecord & {
  sender: AdminProfile | null;
  recipient: AdminProfile | null;
  depositCode: { code: string } | null;
  resolver: AdminProfile | null;
};

function toAdminProfile(profile: PublicProfile | undefined): AdminProfile | null {
  if (!profile) return null;
  return {
    ...profile,
    avatar: profile.avatarUpdatedAt ? { updatedAt: profile.avatarUpdatedAt } : null,
  };
}

async function toAdminRows(rows: TransactionRecord[]): Promise<AdminTransactionRow[]> {
  if (rows.length === 0) return [];

  const [people, codes] = await Promise.all([profilesById(), depositCodesForRead()]);

  return rows.map((row) => ({
    ...row,
    sender: toAdminProfile(row.senderId ? people.get(row.senderId) : undefined),
    recipient: toAdminProfile(row.recipientId ? people.get(row.recipientId) : undefined),
    depositCode: row.depositCodeId ? (codes.get(row.depositCodeId) ?? null) : null,
    resolver: toAdminProfile(row.resolvedById ? people.get(row.resolvedById) : undefined),
  }));
}

export async function getAdminTransactions(
  filter: AdminTransactionFilter = "all",
  limit = 40,
): Promise<AdminTransactionRow[]> {
  const supabase = await createClient();

  let query = supabase.from("transactions").select("*");

  if (filter === "transfers") query = query.eq("type", "TRANSFER").eq("status", "COMPLETED");
  if (filter === "deposits") query = query.eq("type", "DEPOSIT");
  if (filter === "withdrawals") query = query.eq("type", "WITHDRAWAL");
  if (filter === "pending") query = query.eq("status", "PENDING");
  if (filter === "declined") query = query.eq("status", "FAILED");

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];

  return toAdminRows(data.map(mapTransaction));
}

export type PendingWithdrawalRow = AdminTransactionRow;

/** Pending simulated withdrawals awaiting an admin decision. */
export async function getPendingWithdrawals(limit = 25): Promise<PendingWithdrawalRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("type", "WITHDRAWAL")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return toAdminRows(data.map(mapTransaction));
}

export type DepositCodeListRow = DepositCodeRecord & {
  createdBy: { username: string } | null;
  _count: { transactions: number };
};

export async function getDepositCodes(limit = 40): Promise<DepositCodeListRow[]> {
  const supabase = await createClient();

  const [{ data: codeRows }, { data: txRows }, { data: profileRows }] = await Promise.all([
    supabase.from("deposit_codes").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("transactions").select("deposit_code_id").not("deposit_code_id", "is", null),
    supabase.from("profiles").select("id, username"),
  ]);

  const usernames = new Map<string, string>();
  for (const row of profileRows ?? []) usernames.set(String(row.id), String(row.username));

  const redemptions = new Map<string, number>();
  for (const row of txRows ?? []) {
    const id = String(row.deposit_code_id);
    redemptions.set(id, (redemptions.get(id) ?? 0) + 1);
  }

  return (codeRows ?? [])
    .map(mapDepositCode)
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((code) => ({
      ...code,
      createdBy: code.createdById ? { username: usernames.get(code.createdById) ?? "—" } : null,
      _count: { transactions: redemptions.get(code.id) ?? 0 },
    }));
}

/** Row counts behind the console's ledger-clear control. */
export async function getTransactionCounts() {
  const supabase = await createClient();

  const { data } = await supabase.from("transactions").select("type, status, amount_cents");
  const rows = data ?? [];

  const pending = rows.filter((row) => row.type === "WITHDRAWAL" && row.status === "PENDING");

  return {
    total: rows.length,
    settled: rows.filter((row) => row.status === "COMPLETED" || row.status === "FAILED").length,
    pendingCount: pending.length,
    // Only the requested amount is held: the withdrawal fee is informational and
    // never leaves a wallet, so it must not inflate the held total.
    pendingHeldCents: pending.reduce((sum, row) => sum + Number(row.amount_cents), 0),
  };
}

// ---------------------------------------------------------------------------
// Withdrawal fee
// ---------------------------------------------------------------------------

/**
 * The active flat withdrawal fee, for the operations console.
 *
 * `admin_get_withdrawal_fee()` is the authoritative read (it is the function the
 * database exposes for exactly this), and the base table is used as a fallback
 * because some deploys restrict the RPC to the console session. `null` means
 * neither path returned a fee — the panel then shows a configuration notice
 * instead of inventing a $0.00 fee that would be wrong.
 */
export async function getWithdrawalFeeSettings(): Promise<WithdrawalFeeSettings | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_get_withdrawal_fee");
  if (!error) {
    const settings = mapWithdrawalFeeSettings(data);
    if (settings) return settings;
  }

  // The canonical row is `id = 'default'` (the migration seeds it), so filter on
  // it instead of taking "whichever row comes back first".
  const { data: row, error: tableError } = await supabase
    .from("withdrawal_fee_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (tableError) return null;
  return mapWithdrawalFeeSettings(row);
}

/**
 * The fee `request_withdrawal` will record for THIS customer.
 *
 * `my_withdrawal_fee()` is the authoritative read: a SECURITY DEFINER function
 * keyed on `auth.uid()` that returns the caller's own custom account fee when
 * they have one and the global default when they do not — the same resolution
 * the request path performs. Reading it here is what keeps the pre-submit
 * disclosure from drifting away from the fee stored on the request.
 *
 * Nothing here is trusted for money movement: the request path resolves the fee
 * itself. If the function is not deployed yet the call simply fails, and the
 * older global reads below still describe the default fee, so the screen behaves
 * exactly as it did before.
 */
export async function getPublicWithdrawalFee(): Promise<WithdrawalFeeSettings | null> {
  const supabase = await createClient();

  const { data: effective, error: effectiveError } = await supabase.rpc("my_withdrawal_fee");
  if (!effectiveError) {
    const settings = mapWithdrawalFeeSettings(effective);
    if (settings) return settings;
  }

  const { data, error } = await supabase
    .from("withdrawal_fee_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (!error) {
    const settings = mapWithdrawalFeeSettings(data);
    if (settings) return settings;
  }

  // Browser-safe projection, when the deployment exposes one (the same pattern
  // `public_chat_settings` uses). Absent is fine — we simply show nothing.
  const { data: viewRow, error: viewError } = await supabase
    .from("public_withdrawal_fee_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (viewError) return null;
  return mapWithdrawalFeeSettings(viewRow);
}

// ---------------------------------------------------------------------------
// Live chat
// ---------------------------------------------------------------------------

/** Full configuration row — console only (RLS: admin). */
export async function getChatSettings(): Promise<ChatSettingsRecord> {
  const supabase = await createClient();
  const { data } = await supabase.from("chat_settings").select("*").eq("id", "default").maybeSingle();
  return mapChatSettings(data ?? null);
}

/** Browser-safe slice used to mount the widget. */
export async function getPublicChatSettings(): Promise<ChatSettingsRecord> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_chat_settings")
    .select("*")
    .maybeSingle();

  return mapChatSettings(data ?? null);
}
