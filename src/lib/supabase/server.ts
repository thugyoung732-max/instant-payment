import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { toNextCookieOptions, type CookieToSet } from "./cookies";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Server Supabase client.
 *
 * Every read and every write in this app goes through here (or through a server
 * action built on it). Sessions live in HTTP-only cookies managed by
 * @supabase/ssr, so the browser never holds a token it could replay as another
 * user, and `auth.uid()` inside the database always matches the caller.
 */
export async function createClient() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, toNextCookieOptions(options));
          }
        } catch {
          // Server Components cannot set cookies. Session refresh is handled by
          // proxy.ts, which runs before the component and can write them.
        }
      },
    },
  });
}

/** Server client, or null when the project has no credentials yet. */
export async function createOptionalClient() {
  if (!supabaseUrl() || !supabasePublishableKey()) return null;
  return createClient();
}
