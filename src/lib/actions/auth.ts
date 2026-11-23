"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { AuthResult, RecipientLookup } from "@/lib/data/types";
import {
  firstIssue,
  logInSchema,
  normaliseNameForCompare,
  normaliseUsername,
  signUpSchema,
  USERNAME_PATTERN,
} from "@/lib/validation";

/**
 * Authentication, delegated to Supabase Auth.
 *
 * Accounts, passwords and sessions live in Supabase. The app never stores a
 * password or a password hash, and the browser never receives one. `signUp` and
 * `signInWithPassword` run inside server actions, so @supabase/ssr writes the
 * session into HTTP-only cookies and the token never touches client JavaScript.
 */

const NOT_CONFIGURED =
  "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.";

const GENERIC_CREDENTIALS = "Those details didn't match an account.";

const HUES = [156, 172, 142, 196, 214, 262, 24, 340];

function hueForUsername(username: string): number {
  let total = 0;
  for (const char of username) total += char.charCodeAt(0);
  return HUES[total % HUES.length];
}

type IdentityRow = { username: string; display_name: string };

/**
 * Keeps a visible identity unambiguous: a handle may not duplicate another
 * account's name, and a name may not duplicate another account's handle.
 * Uses the public projection, which is exactly the information the confusion
 * would be visible through.
 */
function identityConflict(
  rows: IdentityRow[],
  params: { username: string; displayName: string },
): string | null {
  const taken = rows.find((row) => row.username === params.username);
  if (taken) return `@${params.username} is already taken.`;

  const compare = normaliseNameForCompare(params.displayName);

  const nameIsHandle = rows.find((row) => row.username === compare);
  if (nameIsHandle) {
    return `That name would be confusing — @${nameIsHandle.username} already uses it. Choose a different name.`;
  }

  const handleIsName = rows.find(
    (row) =>
      row.display_name.toLowerCase() === params.username.toLowerCase() ||
      row.display_name.toLowerCase() === `@${params.username}`.toLowerCase(),
  );
  if (handleIsName) {
    return `That name belongs to @${handleIsName.username}, so @${params.username} would be confusing. Choose a different handle.`;
  }

  return null;
}

async function publicIdentities(): Promise<IdentityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("public_profiles").select("username, display_name");
  return (data ?? []).map((row) => ({
    username: String(row.username),
    display_name: String(row.display_name),
  }));
}

function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();

  if (text.includes("already registered") || text.includes("already exists")) {
    return "That email already has an INSTANT PAYMENT account.";
  }
  if (text.includes("invalid login credentials")) return GENERIC_CREDENTIALS;
  if (text.includes("email not confirmed")) return "Confirm your email address, then sign in.";
  if (text.includes("password should be") || text.includes("password is too short")) {
    return "Use at least 8 characters.";
  }
  if (text.includes("rate limit") || text.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (text.includes("invalid email")) return "Enter a valid email address.";

  return "Something went wrong. Try again.";
}

export async function signUpAction(input: {
  email?: unknown;
  username?: unknown;
  displayName?: unknown;
  password?: unknown;
}): Promise<AuthResult> {
  if (!supabaseConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const parsed = signUpSchema.safeParse({
    email: input.email ?? "",
    username: input.username ?? "",
    displayName: input.displayName ?? "",
    password: input.password ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { email, username, displayName, password } = parsed.data;

  const conflict = identityConflict(await publicIdentities(), { username, displayName });
  if (conflict) return { ok: false, error: conflict };

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: displayName,
        avatar_hue: hueForUsername(username),
      },
    },
  });

  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  if (!data.session) {
    return {
      ok: false,
      error:
        "Account created. Confirm the email we sent you, then sign in — or turn off email confirmation in Supabase for this prototype.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, error: null, redirectTo: "/app" };
}

export async function logInAction(input: {
  identifier?: unknown;
  password?: unknown;
}): Promise<AuthResult> {
  if (!supabaseConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const parsed = logInSchema.safeParse({
    identifier: input.identifier ?? "",
    password: input.password ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const identifier = parsed.data.identifier.trim();
  const supabase = await createClient();

  // Accept an email address or an @handle. The lookup is a database function
  // that returns only the email for an exact match.
  const { data: resolvedEmail } = await supabase.rpc("email_for_identifier", {
    identifier,
  });

  const email = typeof resolvedEmail === "string" ? resolvedEmail : identifier;
  if (!email.includes("@")) return { ok: false, error: GENERIC_CREDENTIALS };

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { ok: false, error: error ? friendlyAuthError(error.message) : GENERIC_CREDENTIALS };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", data.user.id)
    .maybeSingle();

  revalidatePath("/", "layout");
  return { ok: true, error: null, redirectTo: profile?.is_admin ? "/admin" : "/app" };
}

export async function logOutAction(): Promise<void> {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Recipient lookup for the send flow
// ---------------------------------------------------------------------------

export async function lookupRecipient(rawUsername: string): Promise<RecipientLookup> {
  const username = normaliseUsername(rawUsername ?? "");

  if (!supabaseConfigured() || !USERNAME_PATTERN.test(username)) {
    return { status: "invalid", username };
  }

  const supabase = await createClient();

  const [{ data: rows }, { data: session }] = await Promise.all([
    supabase
      .from("public_profiles")
      .select("id, username, display_name, avatar_hue, avatar_updated_at")
      .eq("username", username)
      .limit(1),
    supabase.auth.getUser(),
  ]);

  const match = rows?.[0];
  if (!match) return { status: "missing", username };

  const profile = {
    username: String(match.username),
    displayName: String(match.display_name),
    avatarHue: Number(match.avatar_hue ?? 156),
    avatarUpdatedAt: match.avatar_updated_at ? String(match.avatar_updated_at) : null,
  };

  const isSelf = session.user?.id === match.id;
  return isSelf ? { status: "self", ...profile } : { status: "found", ...profile };
}
