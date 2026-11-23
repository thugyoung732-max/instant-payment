"use server";

import { revalidatePath } from "next/cache";

import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ProfileActionState } from "@/lib/data/types";
import { firstIssue, profileSchema } from "@/lib/validation";

/**
 * Profile self-service. Identity and the avatar are written by database
 * functions scoped to `auth.uid()`, so a customer can only ever edit their own
 * row — and never the columns that hold a balance or a role.
 */

const EXPIRED: ProfileActionState = { error: "Your session expired. Sign in again.", success: null };
const NOT_CONFIGURED: ProfileActionState = {
  error:
    "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.",
  success: null,
};

function messageFrom(error: { message?: string } | null, fallback: string): string {
  const message = (error?.message ?? "").trim();
  if (!message) return fallback;

  switch (message.split("\n")[0]) {
    case "USERNAME_TAKEN":
      return "That handle is already taken.";
    case "CONFUSING_IDENTITY":
      return "That name or handle is too close to another account. Choose a different one.";
    case "UNAUTHENTICATED":
      return EXPIRED.error ?? "Your session expired. Sign in again.";
    case "INVALID_IMAGE":
      return "Use a JPG, PNG, WEBP or GIF image.";
    default:
      return message.includes(" ") ? message.slice(0, 160) : fallback;
  }
}

export async function updateProfileAction(input: {
  username: string;
  displayName: string;
}): Promise<ProfileActionState> {
  if (!supabaseConfigured()) return NOT_CONFIGURED;

  const parsed = profileSchema.safeParse({
    username: input.username ?? "",
    displayName: input.displayName ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), success: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EXPIRED;

  const { error } = await supabase.rpc("update_identity", {
    p_username: parsed.data.username,
    p_display_name: parsed.data.displayName,
  });

  if (error) return { error: messageFrom(error, "We couldn't save that profile."), success: null };

  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
  return { error: null, success: "Profile updated." };
}

export async function uploadAvatarAction(input: {
  dataUrl: string;
  mimeType: string;
}): Promise<ProfileActionState> {
  if (!supabaseConfigured()) return NOT_CONFIGURED;

  if (!input.dataUrl?.startsWith("data:image/")) {
    return { error: "Use a JPG, PNG, WEBP or GIF image.", success: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EXPIRED;

  const { error } = await supabase.rpc("set_avatar", {
    p_data_url: input.dataUrl,
    p_mime: input.mimeType,
  });

  if (error) {
    return { error: messageFrom(error, "We couldn't save that picture."), success: null };
  }

  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
  return { error: null, success: "Profile picture updated." };
}

export async function removeAvatarAction(): Promise<ProfileActionState> {
  if (!supabaseConfigured()) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EXPIRED;

  const { error } = await supabase.rpc("clear_avatar");
  if (error) {
    return { error: messageFrom(error, "We couldn't remove that picture."), success: null };
  }

  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
  return { error: null, success: "Profile picture removed." };
}
