/**
 * Live-chat configuration helpers.
 *
 * The console owns one settings row in Supabase; customers read the browser-safe
 * projection of it. Loader resolution stays identical to before, so the widget
 * behaves exactly as it did when the settings lived in the database.
 */

import {
  normalizeLoaderUrl,
  normalizeProviderKey,
  type ChatConfig,
  type ChatProviderId,
} from "@/lib/chat-config";
import type { ChatSettingsRecord } from "@/lib/data/types";

export type { ChatSettingsRecord };

export const DISABLED_CHAT_SETTINGS: ChatSettingsRecord = {
  id: "default",
  enabled: false,
  provider: "smartsupp",
  primaryKey: null,
  secondaryKey: null,
  customScriptUrl: null,
  accentColor: "#0f8a5f",
  position: "right",
  welcomeMessage: null,
};

/** Fills in defaults for anything the row left empty. */
export function normaliseChatSettings(record: ChatSettingsRecord | null): ChatSettingsRecord {
  if (!record) return DISABLED_CHAT_SETTINGS;

  return {
    ...record,
    provider: record.provider || "smartsupp",
    accentColor: record.accentColor || "#0f8a5f",
    position: record.position === "left" ? "left" : "right",
  };
}

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
