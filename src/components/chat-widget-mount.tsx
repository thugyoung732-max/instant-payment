import React from 'react';

import { ChatWidget } from "@/components/fairmoney/chat-widget";
import { chatConfigFrom, normaliseChatSettings } from "@/lib/chat";
import { getPublicChatSettings } from "@/lib/data/queries";

/**
 * Mounts the customer-facing live-chat widget.
 *
 * The configuration is read on the server from the browser-safe projection of
 * the console's settings row, so switching chat on (or pasting a new Smartsupp
 * key) takes effect on the next page load without shipping the whole settings
 * record — which also carries the console-only fields — to the client.
 */
export async function ChatWidgetMount() {
  let settings;

  try {
    settings = normaliseChatSettings(await getPublicChatSettings());
  } catch {
    // No Supabase credentials, or the widget view is unreachable. Chat simply
    // does not mount; the rest of the app is unaffected.
    return null;
  }

  return (
    <ChatWidget config={chatConfigFrom(settings)} accentColor={settings.accentColor} />
  );
}
