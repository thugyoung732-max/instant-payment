import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { mapProfile } from "@/lib/data/mappers";
import type { Profile } from "@/lib/data/types";
import { createOptionalClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";

/**
 * Server-side identity helpers.
 *
 * The only trusted source of "who is calling" is the Supabase session cookie,
 * verified against the auth server. Nothing in the client is consulted, and the
 * database independently re-derives the caller with `auth.uid()` inside every
 * function that moves money.
 */

/** The signed-in profile, or null. Memoised per request. */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  if (!supabaseConfigured()) return null;

  const supabase = await createOptionalClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  return mapProfile(data);
});

/** Profile for pages that require a session. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Profile for the operations console.
 *
 * Requirements are checked twice on purpose: here so a signed-in customer is
 * redirected before any console markup is produced, and again inside every
 * `admin_*` database function, which raises unless `profiles.is_admin` is true
 * for the caller.
 */
export async function requireAdminProfile(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!profile.isAdmin) redirect("/app");
  return profile;
}

export { supabaseConfigured };
