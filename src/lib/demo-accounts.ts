/**
 * Sandbox demo profiles, used by the admin portal's one-click seeder and shown
 * in the UI. Kept out of the "use server" action module because those files may
 * only export async functions.
 */

export const DEMO_PASSWORD = "sandbox123";

export const DEMO_ACCOUNTS: Array<{
  username: string;
  displayName: string;
  balanceCents: number;
}> = [
  { username: "adaeze", displayName: "Adaeze Okonkwo", balanceCents: 412_550 },
  { username: "tunde_b", displayName: "Tunde Bakare", balanceCents: 96_400 },
  { username: "mira", displayName: "Mira Castellanos", balanceCents: 1_275_000 },
  { username: "satoshi_fan", displayName: "Kenji Watanabe", balanceCents: 78_900 },
  { username: "zoe", displayName: "Zoe Lindqvist", balanceCents: 305_000 },
  { username: "peter_o", displayName: "Peter Oyelaran", balanceCents: 24_500 },
];
