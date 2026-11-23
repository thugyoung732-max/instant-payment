import React from 'react';

import { LiveChatButton } from "@/components/fairmoney/chat-widget";
import type { ChatConfig } from "@/lib/chat-config";

/**
 * In-app support block. Everything runs through the live-chat provider, so there
 * are no separate email/phone channels to keep in sync.
 */
export function SupportCard({
  live,
  config,
  welcomeMessage,
  providerLabel,
}: {
  live: boolean;
  config: ChatConfig;
  welcomeMessage: string | null;
  providerLabel: string;
}) {
  return (
    <div className="space-y-4">
      {live ? (
        <>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            {welcomeMessage ?? "Our team is online and can answer questions about your account."}
          </p>
          <LiveChatButton config={config} label={`Chat with ${providerLabel}`} />
        </>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Live chat is not available right now. Please try again in a few minutes.
        </p>
      )}
    </div>
  );
}
