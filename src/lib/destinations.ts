/**
 * Withdrawal destinations. Client-safe: the withdrawal form and the server
 * validation both read this list, so an unknown destination can never be
 * submitted and the presentation stays consistent.
 */

export type DestinationKind = "cashapp" | "paypal" | "venmo" | "zelle" | "bank";

export type WithdrawalDestination = {
  id: string;
  label: string;
  kind: DestinationKind;
  /** What we ask the customer for. */
  identifierLabel: string;
  identifierPlaceholder: string;
  /** Bank rails ask for the account number; wallets ask for a tag or email. */
  needsAccountNumber: boolean;
  group: "Wallets & apps" | "Banks & credit unions";
};

export const DESTINATION_GROUPS = ["Wallets & apps", "Banks & credit unions"] as const;

export const WITHDRAWAL_DESTINATIONS: WithdrawalDestination[] = [
  {
    id: "cashapp",
    label: "Cash App",
    kind: "cashapp",
    identifierLabel: "Cashtag",
    identifierPlaceholder: "$yourcashtag",
    needsAccountNumber: false,
    group: "Wallets & apps",
  },
  {
    id: "paypal",
    label: "PayPal",
    kind: "paypal",
    identifierLabel: "PayPal email",
    identifierPlaceholder: "you@example.com",
    needsAccountNumber: false,
    group: "Wallets & apps",
  },
  {
    id: "venmo",
    label: "Venmo",
    kind: "venmo",
    identifierLabel: "Venmo username",
    identifierPlaceholder: "@your-venmo",
    needsAccountNumber: false,
    group: "Wallets & apps",
  },
  {
    id: "zelle",
    label: "Zelle",
    kind: "zelle",
    identifierLabel: "Zelle email or mobile number",
    identifierPlaceholder: "you@example.com or +1 555 0100",
    needsAccountNumber: false,
    group: "Wallets & apps",
  },
  {
    id: "bank-account",
    label: "Bank account (ACH)",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "chase",
    label: "Chase",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "bank-of-america",
    label: "Bank of America",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "wells-fargo",
    label: "Wells Fargo",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "citi",
    label: "Citi",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "capital-one",
    label: "Capital One",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "us-bank",
    label: "U.S. Bank",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "pnc",
    label: "PNC Bank",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "td-bank",
    label: "TD Bank",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "truist",
    label: "Truist",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "ally",
    label: "Ally Bank",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "discover",
    label: "Discover Bank",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "navy-federal",
    label: "Navy Federal Credit Union",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "regions",
    label: "Regions Bank",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "fifth-third",
    label: "Fifth Third Bank",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "keybank",
    label: "KeyBank",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "barclays",
    label: "Barclays",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "hsbc",
    label: "HSBC",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
  {
    id: "santander",
    label: "Santander",
    kind: "bank",
    identifierLabel: "Account number",
    identifierPlaceholder: "000123456789",
    needsAccountNumber: true,
    group: "Banks & credit unions",
  },
];

export const DESTINATION_IDS = WITHDRAWAL_DESTINATIONS.map((item) => item.id);

export function findDestination(id: string): WithdrawalDestination | undefined {
  return WITHDRAWAL_DESTINATIONS.find((item) => item.id === id);
}

/** Keeps account numbers and long handles out of the stored destination. */
export function maskIdentifier(identifier: string, kind: DestinationKind): string {
  const trimmed = identifier.trim();
  if (kind === "bank") return `····${trimmed.slice(-4)}`;
  if (trimmed.length <= 6) return trimmed;
  return `${trimmed.slice(0, 2)}···${trimmed.slice(-2)}`;
}
