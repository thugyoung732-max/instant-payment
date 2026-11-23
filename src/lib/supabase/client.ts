import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Browser Supabase client.
 *
 * The app reads and writes through the server (server components, server
 * actions and database functions), so this exists for client-side needs such as
 * listening to auth state. It carries only the publishable key; Row Level
 * Security decides what it may see.
 */
export function createClient() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createBrowserClient(url, key);
}
