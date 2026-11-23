/**
 * Money helpers. All values are integer cents to avoid floating point drift.
 *
 * Fairmoney is a simulation: these amounts are synthetic bookkeeping values
 * backed by internal sandbox codes and admin adjustments. Nothing here is
 * redeemable and no external financial rail is involved.
 */

/** Upper bound for any single simulated movement ($1,000,000). */
export const MAX_AMOUNT_CENTS = 100_000_000;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 -> "$1,234.56" */
export function formatUSD(cents: number): string {
  return usd.format(cents / 100);
}

/** "$1,250.50" / "1250.5" / "1,250" -> 125050 (or null when unusable) */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[\s,$]/g, "").replace(/^USD/i, "");
  if (!cleaned) return null;
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if (cents <= 0 || cents > MAX_AMOUNT_CENTS) return null;
  return cents;
}

/** 125050 -> "1250.50" for populating an <input>. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Compact balance split for the big display number, e.g. "$" + "1,234" + ".56" */
export function splitUSD(cents: number): { symbol: string; whole: string; fraction: string } {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const fraction = String(abs % 100).padStart(2, "0");
  return { symbol: negative ? "-$" : "$", whole, fraction };
}
