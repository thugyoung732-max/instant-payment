"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import {
  CHAT_PROVIDERS,
  normalizeLoaderUrl,
  normalizeProviderKey,
  type ChatProviderId,
} from "@/lib/chat-config";
import { getChatSettings } from "@/lib/chat";
import { prisma } from "@/lib/prisma";

export type ChatActionResult = { ok: boolean; message: string };

const PROVIDER_IDS = CHAT_PROVIDERS.map((item) => item.id) as [string, ...string[]];

const chatSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(PROVIDER_IDS),
  // Generous: operators paste the provider's whole installation snippet here and
  // only the key is kept.
  primaryKey: z.string().trim().max(2000).optional(),
  secondaryKey: z.string().trim().max(2000).optional(),
  customScriptUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .refine(
      (value) => !value || !/[<\n]/.test(value) || /src\s*=\s*["']https?:\/\//i.test(value),
      "Paste the loader URL itself, or the full <script src=\"…\"> snippet.",
    )
    .refine(
      (value) => !value || /^\s*https?:\/\/\S+/.test(normalizeLoaderUrl(value)),
      "The loader script URL must start with http:// or https://",
    ),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #0f8a5f")
    .default("#0f8a5f"),
  position: z.enum(["right", "left"]).default("right"),
  welcomeMessage: z.string().trim().max(160).optional(),
});

function revalidateChat(): void {
  // The widget is rendered by the root layout, so every surface is affected.
  revalidatePath("/", "layout");
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
}): Promise<ChatActionResult> {
  const admin = await requireAdmin();

  const parsed = chatSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Those settings look invalid." };
  }

  const data = parsed.data;
  const providerId = data.provider as ChatProviderId;

  // Operators paste the provider's whole installation snippet; store only the key.
  const rawKey = (data.primaryKey ?? "").trim();
  const primaryKey = normalizeProviderKey(providerId, rawKey);
  const customScriptUrl = normalizeLoaderUrl(data.customScriptUrl ?? "");

  if (data.provider !== "custom" && rawKey && !primaryKey) {
    return {
      ok: false,
      message:
        "That looks like an installation snippet, but no usable key was found in it. Paste the full snippet, or just the key value itself.",
    };
  }

  const needsKey = data.provider !== "custom";
  const hasKey = needsKey ? Boolean(primaryKey) : Boolean(customScriptUrl);

  // Enabling a provider without its key would silently load nothing.
  const enabled = data.enabled && hasKey;

  const existing = await getChatSettings();

  await prisma.chatSettings.update({
    where: { id: existing.id },
    data: {
      enabled,
      provider: data.provider,
      primaryKey: primaryKey || null,
      secondaryKey: data.secondaryKey || null,
      customScriptUrl: customScriptUrl || null,
      accentColor: data.accentColor,
      position: data.position,
      welcomeMessage: data.welcomeMessage || null,
      fallbackEmail: null,
      fallbackPhone: null,
      fallbackWhatsapp: null,
      updatedById: admin.id,
    },
  });

  revalidateChat();

  const providerLabel = CHAT_PROVIDERS.find((item) => item.id === data.provider)?.label ?? data.provider;

  if (data.enabled && !hasKey) {
    return {
      ok: true,
      message: `Saved, but live chat is still off: ${providerLabel} needs its ${needsKey ? "key" : "loader URL"} before it can load.`,
    };
  }

  return {
    ok: true,
    message: enabled ? `${providerLabel} live chat is now loading on customer pages.` : "Settings saved (live chat off).",
  };
}

export async function setChatEnabledAction(enabled: boolean): Promise<ChatActionResult> {
  await requireAdmin();

  const existing = await getChatSettings();
  const hasKey =
    existing.provider === "custom"
      ? Boolean(normalizeLoaderUrl(existing.customScriptUrl))
      : Boolean(normalizeProviderKey(existing.provider as ChatProviderId, existing.primaryKey));

  if (enabled && !hasKey) {
    return { ok: false, message: "Add the provider key (or loader URL) before switching live chat on." };
  }

  await prisma.chatSettings.update({ where: { id: existing.id }, data: { enabled } });
  revalidateChat();

  return { ok: true, message: enabled ? "Live chat enabled." : "Live chat paused." };
}
