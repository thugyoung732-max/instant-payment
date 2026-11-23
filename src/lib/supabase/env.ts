/**
 * Supabase connection settings.
 *
 * Both values are publishable by design — they ship in the browser bundle and
 * every request is still filtered by Row Level Security. The service-role key is
 * deliberately NOT read anywhere in this app: nothing here needs to bypass RLS.
 */

export const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
export const SUPABASE_KEY_ENV =
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY";

/**
 * Values shipped in .env as instructions, not credentials. They are treated as
 * "not configured" so the app explains the setup instead of trying to reach a
 * host that does not exist.
 */
const PLACEHOLDER = /(your[-_]|example\.|placeholder|changeme|paste|xxx)/i;

export function supabaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!value || PLACEHOLDER.test(value)) return null;
  return value.replace(/\/+$/, "");
}

export function supabasePublishableKey(): string | null {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!value || PLACEHOLDER.test(value)) return null;
  return value;
}

/** False until the project URL and publishable key are present. */
export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}
