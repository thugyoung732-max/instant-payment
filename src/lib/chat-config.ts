/**
 * Chat provider catalogue. Client-safe: the widget and the console form both
 * read it, so the loader and the fields shown always agree.
 *
 * Only public client-side widget keys belong here — these values are visible in
 * the page by design (that is how Smartsupp, Crisp and friends work). Never put
 * a provider API secret in this table.
 */

export type ChatProviderId = "smartsupp" | "crisp" | "tawk" | "intercom" | "livechat" | "custom";

export type ChatProvider = {
  id: ChatProviderId;
  label: string;
  /** Where the operator finds the key, in their own dashboard. */
  hint: string;
  primaryLabel: string | null;
  primaryPlaceholder: string | null;
  secondaryLabel: string | null;
  secondaryPlaceholder: string | null;
  customUrlLabel: string | null;
  customUrlPlaceholder: string | null;
};

export const CHAT_PROVIDERS: ChatProvider[] = [
  {
    id: "smartsupp",
    label: "Smartsupp",
    hint: "Smartsupp → Settings → Chat box → installation code. The key is the long id in _smartsupp.key.",
    primaryLabel: "Smartsupp key",
    primaryPlaceholder: "5f1c9b2a3d4e5f6a7b8c9d0e",
    secondaryLabel: null,
    secondaryPlaceholder: null,
    customUrlLabel: null,
    customUrlPlaceholder: null,
  },
  {
    id: "crisp",
    label: "Crisp",
    hint: "Crisp → Settings → Website settings → Setup & Integrations. The website ID looks like a UUID.",
    primaryLabel: "Website ID",
    primaryPlaceholder: "6b1f2c3d-4e5f-6789-abcd-ef0123456789",
    secondaryLabel: null,
    secondaryPlaceholder: null,
    customUrlLabel: null,
    customUrlPlaceholder: null,
  },
  {
    id: "tawk",
    label: "Tawk.to",
    hint: "Tawk.to → Administration → Chat widget → Direct chat link, e.g. https://tawk.to/chat/PROPERTY_ID/WIDGET_ID.",
    primaryLabel: "Property ID",
    primaryPlaceholder: "6a1b2c3d4e5f6a7b8c9d0e1f",
    secondaryLabel: "Widget ID",
    secondaryPlaceholder: "default",
    customUrlLabel: null,
    customUrlPlaceholder: null,
  },
  {
    id: "intercom",
    label: "Intercom",
    hint: "Intercom → Settings → Installation → Web. The app ID is the short code in your workspace URL.",
    primaryLabel: "App ID",
    primaryPlaceholder: "abc123xy",
    secondaryLabel: null,
    secondaryPlaceholder: null,
    customUrlLabel: null,
    customUrlPlaceholder: null,
  },
  {
    id: "livechat",
    label: "LiveChat",
    hint: "LiveChat → Settings → Channels → Chat widget → Tracking code. The license number is in __lc.license.",
    primaryLabel: "License number",
    primaryPlaceholder: "12345678",
    secondaryLabel: null,
    secondaryPlaceholder: null,
    customUrlLabel: null,
    customUrlPlaceholder: null,
  },
  {
    id: "custom",
    label: "Any other script",
    hint: "Paste the widget loader URL from any other provider (HubSpot, Zendesk, HelpScout, Drift…). It is injected as a script tag on customer pages.",
    primaryLabel: null,
    primaryPlaceholder: null,
    secondaryLabel: null,
    secondaryPlaceholder: null,
    customUrlLabel: "Loader script URL",
    customUrlPlaceholder: "https://widget.example.com/loader.js",
  },
];

export function chatProvider(id: string): ChatProvider {
  return CHAT_PROVIDERS.find((item) => item.id === id) ?? CHAT_PROVIDERS[0];
}

export type ChatConfig = {
  enabled: boolean;
  provider: ChatProviderId;
  primaryKey: string | null;
  secondaryKey: string | null;
  customScriptUrl: string | null;
};

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Operators almost always paste the provider's whole embed snippet rather than
 * the bare key. Pull the key out of it so the widget still loads; return "" when
 * the value is markup that contains no usable key, so a broken key is never
 * loaded into the page.
 */
export function normalizeProviderKey(provider: ChatProviderId, raw: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (provider === "custom") return value;

  const looksLikeCode = /[<\n]/.test(value) || /\bkey\b\s*[=:]/i.test(value);
  if (!looksLikeCode) return value;

  const patterns: RegExp[] = [
    /_smartsupp\.key\s*=\s*["']([^"']+)["']/i,
    /_lc\.license\s*=\s*["']?([A-Za-z0-9]+)/i,
    /CRISP_WEBSITE_ID\s*=\s*["']([^"']+)["']/i,
    /["']?app_id["']?\s*[=:]\s*["']([^"']+)["']/i,
    /[?&]key=([A-Za-z0-9_-]+)/i,
    /["']([A-Za-z0-9_-]{16,})["']/,
  ];

  for (const pattern of patterns) {
    const found = value.match(pattern)?.[1]?.trim();
    if (found && !found.includes("<") && !/\s/.test(found)) return found;
  }

  return "";
}

/** Same idea for a pasted `<script src="…">` block in the "any other script" field. */
export function normalizeLoaderUrl(raw: string | null): string {
  const value = (raw ?? "").trim();
  if (!value || !/[<\n]/.test(value)) return value;
  return value.match(/src\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? "";
}

/** The script element the browser should load, or null when not configured. */
export function chatScriptUrl(config: ChatConfig): string | null {
  const key = normalizeProviderKey(config.provider, config.primaryKey);
  const secondary = config.secondaryKey?.trim() ?? "";

  switch (config.provider) {
    case "smartsupp":
      return key ? "https://www.smartsuppchat.com/loader.js?" : null;
    case "crisp":
      return key ? "https://client.crisp.chat/l.js" : null;
    case "tawk":
      return key ? `https://embed.tawk.to/${encodeURIComponent(key)}/${encodeURIComponent(secondary || "default")}` : null;
    case "intercom":
      return key ? `https://widget.intercom.io/widget/${encodeURIComponent(key)}` : null;
    case "livechat":
      return key ? "https://cdn.livechatinc.com/tracking.js" : null;
    case "custom":
      return safeUrl(normalizeLoaderUrl(config.customScriptUrl));
    default:
      return null;
  }
}

/** Window globals the provider's loader expects to find before it runs. */
export function chatGlobals(
  config: ChatConfig,
  accentColor = "#0f8a5f",
): Record<string, unknown> | null {
  const key = normalizeProviderKey(config.provider, config.primaryKey);
  if (!key) return null;

  switch (config.provider) {
    case "smartsupp":
      // _smartsupp.color is the documented way to set the widget colour in code
      // (it can also be set in the Smartsupp dashboard).
      return { _smartsupp: { key, color: accentColor } };
    case "crisp":
      return { $crisp: [], CRISP_WEBSITE_ID: key };
    case "livechat":
      return { __lc: { license: Number(key) || key } };
    case "intercom":
      return { intercomSettings: { app_id: key } };
    default:
      return null;
  }
}



/** Programmatically opens the active provider's chat window, when supported. */
export function openLiveChat(config: ChatConfig): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, any>;

  try {
    switch (config.provider) {
      case "smartsupp":
        w.smartsupp?.("chat:open");
        return true;
      case "crisp":
        w.$crisp?.push(["do", "chat:open"]);
        return true;
      case "tawk":
        w.Tawk_API?.maximize?.();
        return true;
      case "intercom":
        w.Intercom?.("show");
        return true;
      case "livechat":
        w.LiveChatWidget?.call?.("maximize");
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
