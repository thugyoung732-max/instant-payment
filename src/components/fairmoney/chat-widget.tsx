"use client";
import React from 'react';

import { MessageSquare } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import {
  chatGlobals,
  chatScriptUrl,
  chatProvider,
  openLiveChat,
  type ChatConfig,
} from "@/lib/chat-config";

/**
 * Loads the configured live-chat provider on customer-facing pages.
 *
 * The provider's script is injected once, carrying the app accent colour where
 * the provider accepts one, and the provider's own launcher bubble is left
 * untouched — that bubble is the customer's route to a real agent. The admin
 * console is skipped on purpose.
 */
export function ChatWidget({
  config,
  accentColor = "#0f8a5f",
}: {
  config: ChatConfig;
  accentColor?: string;
}) {
  const pathname = usePathname();
  const src = chatScriptUrl(config);
  const live = config.enabled && Boolean(src);
  const onAdmin = pathname.startsWith("/admin");

  const { provider, primaryKey, secondaryKey } = config;

  useEffect(() => {
    if (!live || onAdmin || !src) return;

    const globals = chatGlobals({ ...config, provider, primaryKey, secondaryKey }, accentColor);
    if (globals) {
      for (const [key, value] of Object.entries(globals)) {
        (window as unknown as Record<string, unknown>)[key] = value;
      }
    }

    const id = `ip-live-chat-${provider}`;
    if (!document.getElementById(id)) {
      const script = document.createElement("script");
      script.id = id;
      script.async = true;
      script.src = src;
      script.setAttribute("data-instant-payment-chat", provider);
      document.body.appendChild(script);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, onAdmin, src, provider, primaryKey, secondaryKey, accentColor, config.customScriptUrl]);

  return (
    <span
      hidden
      data-chat-provider={provider}
      data-chat-live={live ? "true" : "false"}
      data-chat-skipped={onAdmin ? "true" : "false"}
      data-chat-script={src ?? ""}
    />
  );
}

/** In-app trigger for the active provider (hidden for providers without an API). */
export function LiveChatButton({
  config,
  label = "Start a live chat",
  variant = "primary",
}: {
  config: ChatConfig;
  label?: string;
  variant?: "primary" | "ghost";
}) {
  const provider = chatProvider(config.provider);

  if (!chatScriptUrl(config) || config.enabled === false || config.provider === "custom") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        const opened = openLiveChat(config);
        if (!opened) {
          toast.error(`Open the ${provider.label} chat bubble to continue.`);
        }
      }}
      className={
        variant === "primary"
          ? "fm-btn fm-btn-primary w-full"
          : "fm-btn fm-btn-ghost w-full"
      }
    >
      <MessageSquare className="h-4 w-4" />
      {label}
    </button>
  );
}
