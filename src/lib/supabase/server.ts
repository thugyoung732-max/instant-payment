import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { toNextCookieOptions, type CookieToSet } from "./cookies";
import { supabasePublishableKey, supabaseUrl } from "./env";

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
          // Server Components cannot set cookies. Session refresh is handled by proxy.ts.
        }
      },
    },
  });
}

export async function createOptionalClient() {
  if (!supabaseUrl() || !supabasePublishableKey()) return null;
  return createClient();
}