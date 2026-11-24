import { z } from "zod";

import { DESTINATION_IDS } from "@/lib/destinations";
import { MAX_AMOUNT_CENTS } from "@/lib/money";

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Accepts "@alice", "alice", " Alice " and normalises to "alice". */
export function normaliseUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Deposit codes are case-insensitive and ignore spaces/dashes. */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export const usernameSchema = z
  .string()
  .transform(normaliseUsername)
  .refine((value) => USERNAME_PATTERN.test(value), {
    message: "Usernames are 3-20 characters: letters, numbers or underscore.",
  });

/**
 * Handles held back for the platform itself. Registration and renaming both
 * refuse them, so no customer account can present itself as INSTANT PAYMENT.
 */
const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "support",
  "help",
  "helpdesk",
  "official",
  "staff",
  "team",
  "system",
  "root",
  "owner",
  "moderator",
  "security",
  "billing",
  "payments",
  "wallet",
  "instantpayment",
  "instant_payment",
  "instantpay",
  "fairmoney",
  "api",
  "www",
  "app",
  "me",
  "you",
  "null",
  "undefined",
  "deleted",
]);

/**
 * Compares a display name against handles the way a reader does: "@Dave",
 * "dave" and "DAVE" are the same identity on screen, so they are treated as the
 * same identity here.
 */
export function normaliseNameForCompare(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** A handle nobody may take: reserved names are refused up front. */
export const availableUsernameSchema = usernameSchema.refine(
  (value) => !RESERVED_HANDLES.has(value),
  { message: "That handle is reserved. Choose a different one." },
);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => EMAIL_PATTERN.test(value), {
    message: "Enter a valid email address.",
  });

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Passwords are limited to 72 characters.");

export const signUpSchema = z.object({
  email: emailSchema,
  username: availableUsernameSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Tell us what to call you.")
    .max(40, "Keep your name under 40 characters."),
  password: passwordSchema,
});

export const logInSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or @username."),
  password: z.string().min(1, "Enter your password."),
});

const amountCentsSchema = z
  .number()
  .int()
  .positive("Enter an amount above $0.00.")
  .max(MAX_AMOUNT_CENTS, "Single movements cap at $1,000,000.");

export const transferSchema = z.object({
  recipientUsername: usernameSchema,
  amountCents: amountCentsSchema,
  note: z.string().trim().max(120, "Notes are limited to 120 characters.").optional(),
});

export const profileSchema = z.object({
  username: availableUsernameSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Tell us what to call you.")
    .max(40, "Keep your name under 40 characters."),
});

export const codePattern = /^[A-Z0-9]{4,32}$/;

export const depositSchema = z.object({
  code: z
    .string()
    .transform(normaliseCode)
    .refine((value) => codePattern.test(value), {
      message: "Enter the 4-32 character deposit code.",
    }),
  // Sent by the form for confirmation only — the credited amount always comes
  // from the code itself on the server.
  amountCents: z.number().int().positive().optional(),
});

export const withdrawalSchema = z.object({
  amountCents: amountCentsSchema,
  destinationId: z
    .string()
    .refine((value) => DESTINATION_IDS.includes(value), { message: "Choose a destination." }),
  accountName: z
    .string()
    .trim()
    .min(2, "Enter the name on the account.")
    .max(60, "Keep the name under 60 characters."),
  identifier: z
    .string()
    .trim()
    .min(3, "Enter the destination details.")
    .max(64, "Keep the destination details under 64 characters."),
});

export const depositCodeSchema = z
  .string()
  .transform(normaliseCode)
  .refine((value) => codePattern.test(value), {
    message: "Codes are 4-32 letters and numbers.",
  });

export const adminCreditSchema = z.object({
  userId: z.string().min(1),
  amountCents: amountCentsSchema,
  note: z.string().trim().max(120).optional(),
});

export const adminCodeSchema = z.object({
  code: depositCodeSchema,
  creditCents: amountCentsSchema,
  label: z.string().trim().max(60).optional(),
  singleUse: z.boolean(),
  maxUses: z.number().int().min(1).max(10_000).nullable(),
});

/** How much of the ledger an admin wants out of the way. */
export const CLEAR_TRANSACTION_SCOPES = ["SETTLED", "ALL"] as const;

export const clearTransactionsSchema = z.object({
  scope: z.enum(CLEAR_TRANSACTION_SCOPES),
});

/**
 * Where a new flat withdrawal fee applies.
 *
 * The values are the exact uppercase strings `admin_update_withdrawal_fee`
 * accepts, so what the form shows, what the action validates and what Postgres
 * receives are the same three words.
 */
export const FEE_APPLY_SCOPES = ["FUTURE", "PENDING", "BOTH"] as const;

export type FeeApplyScope = (typeof FEE_APPLY_SCOPES)[number];

/**
 * A flat withdrawal fee.
 *
 * Deliberately not the shared movement schema: this is a fee, so $0.00 is legal,
 * it is capped far below a transfer, and it is never a percentage — the admin
 * types an amount, and it is converted to cents by the caller before this runs.
 */
export const withdrawalFeeAmountSchema = z
  .number()
  .int()
  .min(0, "A fee cannot be negative.")
  .max(MAX_AMOUNT_CENTS, "Fees cap at $1,000,000.00.");

export const withdrawalFeeSchema = z
  .object({
    feeCents: withdrawalFeeAmountSchema,
    feeReason: z
      .string()
      .trim()
      .max(120, "Keep the fee reason under 120 characters.")
      .default(""),
    applyTo: z.enum(FEE_APPLY_SCOPES),
  })
  .superRefine((value, context) => {
    // A customer has to be told why they are being charged, so a non-zero fee
    // always carries a reason. A $0.00 fee may be saved with none.
    if (value.feeCents > 0 && value.feeReason.trim().length < 3) {
      context.addIssue({
        code: "custom",
        path: ["feeReason"],
        message: "Add a short reason customers will see for this fee.",
      });
    }
  });

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That input doesn't look right.";
}
