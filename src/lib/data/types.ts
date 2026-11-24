/**
 * Domain types shared by the server queries, the server actions and the screens.
 *
 * The field names are the ones the interface was designed around (camelCase,
 * integer cents, real Date objects). Supabase rows are mapped into these shapes
 * so no component had to be rewritten for the move off localStorage.
 */

export type TransactionType =
  | "TRANSFER"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "WELCOME_BONUS"
  | "ADMIN_CREDIT"
  | "ADMIN_RESET";

export type TransactionStatus = "COMPLETED" | "PENDING" | "FAILED";

export type Profile = {
  id: string;
  email: string;
  /** Stored without the leading "@", always lower-cased. */
  username: string;
  displayName: string;
  avatarHue: number;
  isAdmin: boolean;
  balanceCents: number;
  createdAt: Date;
  updatedAt: Date;
  /** Present when the account has a picture; `updatedAt` busts the avatar cache. */
  avatar: { updatedAt: Date } | null;
  avatarDataUrl: string | null;
};

/** Public projection: what one customer may see about another. */
export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  avatarUpdatedAt: Date | null;
};

export type TransactionRecord = {
  id: string;
  reference: string;
  type: TransactionType;
  status: TransactionStatus;
  /** What the user asked for. This — never amount + fee — is what was debited. */
  amountCents: number;
  /** Informational flat withdrawal fee. Never held from or added to a balance. */
  feeCents: number;
  /** Admin-supplied reason stored beside the fee when the request was made. */
  feeReason: string | null;
  note: string | null;
  destination: string | null;
  failureReason: string | null;
  senderId: string | null;
  recipientId: string | null;
  senderBalanceAfterCents: number | null;
  recipientBalanceAfterCents: number | null;
  depositCodeId: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdAt: Date;
};

/**
 * The single withdrawal-fee configuration row.
 *
 * `feeCents` is a flat amount in integer cents — not a percentage. It is
 * recorded on a withdrawal for the customer's information and is never taken
 * out of a wallet, so a $500 fee on a $10,000 request still debits $10,000.
 */
export type WithdrawalFeeSettings = {
  feeCents: number;
  feeReason: string;
  updatedAt: Date | null;
  updatedByUsername: string | null;
};

export type DepositCodeRecord = {
  id: string;
  code: string;
  label: string | null;
  creditCents: number;
  active: boolean;
  singleUse: boolean;
  maxUses: number | null;
  uses: number;
  lastUsedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
};

/** The single configuration row behind the customer-facing chat widget. */
export type ChatSettingsRecord = {
  id: string;
  enabled: boolean;
  provider: string;
  primaryKey: string | null;
  secondaryKey: string | null;
  customScriptUrl: string | null;
  accentColor: string;
  position: string;
  welcomeMessage: string | null;
};

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

export type AuthResult = { ok: boolean; error: string | null; redirectTo?: string };

export type AdminActionResult = { ok: boolean; message: string };

export type ProfileActionState = { error: string | null; success: string | null };
