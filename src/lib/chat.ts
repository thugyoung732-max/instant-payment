import "server-only";

import { cache } from "react";

import {
  normalizeLoaderUrl,
  normalizeProviderKey,
  type ChatConfig,
  type ChatProviderId,
} from "@/lib/chat-config";
import { prisma } from "@/lib/prisma";

export type ChatSettingsRecord = {
  id: string;
  enabled: boolean;
  provider: string;
  primaryKey: string | null;
  secondaryKey: string | null;
  customScriptUrl: string | null;
  accentColor: string;
  position: string;
  welcomeMessage: string | null;
};

/**
 * The chat integration is a single configuration row. It is created on first
 * read (disabled, no provider key) so the console always has something to edit.
 * Cached per request because the root layout and the console both read it.
 */
export const getChatSettings = cache(async (): Promise<ChatSettingsRecord> => {
  const existing = await prisma.chatSettings.findFirst({ orderBy: { updatedAt: "desc" } });

  const record =
    existing ??
    (await prisma.chatSettings.create({
      data: {},
      select: {
        id: true,
        enabled: true,
        provider: true,
        primaryKey: true,
        secondaryKey: true,
        customScriptUrl: true,
        accentColor: true,
        position: true,
        welcomeMessage: true,
      },
    }));

  return record as ChatSettingsRecord;
});

const DISABLED_DEFAULTS: ChatSettingsRecord = {
  id: "unconfigured",
  enabled: false,
  provider: "custom",
  primaryKey: null,
  secondaryKey: null,
  customScriptUrl: null,
  accentColor: "#0f8a5f",
  position: "bottom-right",
  welcomeMessage: null,
};

/**
 * Chat settings for the public layout. Unlike {@link getChatSettings} this never
 * throws: on a cold start the database can lag behind the Next.js server, and a
 * failed chat read must not 500 every page (which makes the app look "stuck on
 * deploying"). A transient failure simply disables the widget for that request.
 */
export const getChatSettingsSafe = cache(async (): Promise<ChatSettingsRecord> => {
  try {
    return await getChatSettings();
  } catch (error) {
    console.error("[chat] chat settings unavailable, using disabled fallback:", error);
    return DISABLED_DEFAULTS;
  }
});

/** The subset of settings the browser needs to load a provider widget. */
export function chatConfigFrom(record: ChatSettingsRecord): ChatConfig {
  return {
    enabled: record.enabled,
    provider: record.provider as ChatProviderId,
    primaryKey: record.primaryKey,
    secondaryKey: record.secondaryKey,
    customScriptUrl: record.customScriptUrl,
  };
}

/** True when a provider is switched on *and* has everything it needs. */
export function chatIsLive(record: ChatSettingsRecord): boolean {
  if (!record.enabled) return false;
  if (record.provider === "custom") return Boolean(normalizeLoaderUrl(record.customScriptUrl));
  return Boolean(normalizeProviderKey(record.provider as ChatProviderId, record.primaryKey));
}


