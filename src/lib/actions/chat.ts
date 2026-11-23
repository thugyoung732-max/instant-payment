"use server";

import { revalidatePath } from "next/cache";

import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { AdminActionResult } from "@/lib/data/types";

/**
 * Live-chat configuration.
 *
 * The console writes one row; customers read `public_chat_settings`, which
 * exposes only the widget key and presentation values. The key is public by
 * design — it is the identifier the browser must hand to Smartsupp — and the
 * write itself is gated by `is_admin` inside the database function.
 */

const NOT_CONFIGURED: AdminActionResult = {
  ok: false,
  message:
    "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.",
};

async function guard(): Promise<AdminActionResult | null> {
  if (!supabaseConfigured()) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, message: "Your session expired. Sign in again." };
  return null;
}

export async function saveChatSettingsAction(input: {
  enabled: boolean;
  provider: string;
  primaryKey?: string;
  secondaryKey?: string;
  customScriptUrl?: string;
  accentColor: string;
  position: string;
  welcomeMessage?: string;
}): Promise<AdminActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_save_chat_settings", {
    p_enabled: Boolean(input.enabled),
    p_provider: input.provider || "smartsupp",
    p_public_key: input.primaryKey?.trim() || null,
    p_secondary_key: input.secondaryKey?.trim() || null,
    p_custom_script_url: input.customScriptUrl?.trim() || null,
    p_accent_color: input.accentColor || "#0f8a5f",
    p_position: input.position === "left" ? "left" : "right",
    p_welcome_message: input.welcomeMessage?.trim() || null,
  });

  if (error) {
    return { ok: false, message: "Chat settings were not saved. Operations console access is admin-only." };
  }

  // The widget is mounted by the root layout, so every page re-renders its config.
  revalidatePath("/", "layout");
  return { ok: true, message: "Chat integration saved." };
}

export async function setChatEnabledAction(enabled: boolean): Promise<AdminActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_chat_enabled", { p_enabled: Boolean(enabled) });

  if (error) {
    return { ok: false, message: "That change was not saved. Operations console access is admin-only." };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? "Live chat resumed." : "Live chat paused." };
}
