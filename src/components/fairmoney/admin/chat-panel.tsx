"use client";
import React from 'react';

import { Loader2, MessageSquare, Pause, Play, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { CHAT_PROVIDERS, chatProvider, chatScriptUrl, type ChatProviderId } from "@/lib/chat-config";
import { saveChatSettingsAction, setChatEnabledAction } from "@/server/actions/chat";

export type ChatPanelSettings = {
  enabled: boolean;
  provider: string;
  primaryKey: string | null;
  secondaryKey: string | null;
  customScriptUrl: string | null;
  accentColor: string;
  position: string;
  welcomeMessage: string | null;
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-fm-green-bright/50";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.14em] text-white/40";

/** The wallet's own palette, offered as one-click accent choices. */
const APP_PALETTE = [
  { name: "Wallet emerald", hex: "#0f8a5f" },
  { name: "Bright mint", hex: "#16c78b" },
  { name: "Deep ink", hex: "#071814" },
  { name: "Signal lime", hex: "#c8f24a" },
] as const;

export function ChatPanel({ settings }: { settings: ChatPanelSettings }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ChatPanelSettings>(settings);
  const [busy, setBusy] = useState<null | "save" | "toggle">(null);

  const provider = chatProvider(draft.provider);
  const loaderUrl = chatScriptUrl({
    enabled: draft.enabled,
    provider: draft.provider as ChatProviderId,
    primaryKey: draft.primaryKey,
    secondaryKey: draft.secondaryKey,
    customScriptUrl: draft.customScriptUrl,
  });
  const configured = Boolean(loaderUrl);
  const live = draft.enabled && configured;

  function update(patch: Partial<ChatPanelSettings>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function save() {
    setBusy("save");
    const result = await saveChatSettingsAction({
      enabled: draft.enabled,
      provider: draft.provider,
      primaryKey: draft.primaryKey ?? undefined,
      secondaryKey: draft.secondaryKey ?? undefined,
      customScriptUrl: draft.customScriptUrl ?? undefined,
      accentColor: draft.accentColor,
      position: draft.position,
      welcomeMessage: draft.welcomeMessage ?? undefined,
    });
    setBusy(null);

    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function toggle() {
    setBusy("toggle");
    const result = await setChatEnabledAction(!settings.enabled);
    setBusy(null);

    if (result.ok) {
      update({ enabled: !settings.enabled });
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mr-auto flex items-center gap-2 font-display text-[13.5px] font-semibold text-white">
            <MessageSquare className="h-4 w-4 text-fm-lime" />
            Live chat provider
          </h3>
          <Badge
            variant="outline"
            className={
              live
                ? "gap-1.5 border-fm-lime/30 bg-fm-lime/12 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fm-lime"
                : "border-white/15 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/45"
            }
          >
            {live ? "loading live" : configured ? "ready, paused" : "not configured"}
          </Badge>
        </div>

        <label className="mt-5 block">
          <span className={labelClass}>Provider</span>
          <select
            value={draft.provider}
            onChange={(event) => update({ provider: event.target.value })}
            className={fieldClass}
          >
            {CHAT_PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-[11.5px] leading-relaxed text-white/40">{provider.hint}</span>
        </label>

        {provider.primaryLabel ? (
          <label className="mt-4 block">
            <span className={labelClass}>{provider.primaryLabel}</span>
            <input
              value={draft.primaryKey ?? ""}
              onChange={(event) => update({ primaryKey: event.target.value.slice(0, 2000) })}
              placeholder={provider.primaryPlaceholder ?? ""}
              className={`fm-numeric ${fieldClass}`}
            />
            <span className="mt-2 block text-[11.5px] leading-relaxed text-white/40">
              Paste the whole installation snippet if that&apos;s easier — only the key is stored.
            </span>
          </label>
        ) : null}

        {provider.secondaryLabel ? (
          <label className="mt-4 block">
            <span className={labelClass}>{provider.secondaryLabel}</span>
            <input
              value={draft.secondaryKey ?? ""}
              onChange={(event) => update({ secondaryKey: event.target.value.slice(0, 2000) })}
              placeholder={provider.secondaryPlaceholder ?? ""}
              className={`fm-numeric ${fieldClass}`}
            />
          </label>
        ) : null}

        {provider.customUrlLabel ? (
          <label className="mt-4 block">
            <span className={labelClass}>{provider.customUrlLabel}</span>
            <input
              value={draft.customScriptUrl ?? ""}
              onChange={(event) => update({ customScriptUrl: event.target.value.slice(0, 2000) })}
              placeholder={provider.customUrlPlaceholder ?? ""}
              className={fieldClass}
            />
          </label>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Accent colour</span>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={draft.accentColor}
                onChange={(event) => update({ accentColor: event.target.value })}
                className="h-11 w-14 rounded-xl border border-white/10 bg-white/5"
                aria-label="Accent colour"
              />
              <input
                value={draft.accentColor}
                onChange={(event) => update({ accentColor: event.target.value.slice(0, 7) })}
                className="fm-numeric flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none"
              />
            </div>
            <span className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                App palette
              </span>
              {APP_PALETTE.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() => update({ accentColor: swatch.hex })}
                  title={`${swatch.name} ${swatch.hex}`}
                  aria-label={`Use ${swatch.name}`}
                  className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
                    draft.accentColor.toLowerCase() === swatch.hex.toLowerCase()
                      ? "border-white/70 ring-2 ring-white/25"
                      : "border-white/20"
                  }`}
                  style={{ background: swatch.hex }}
                />
              ))}
            </span>
            <span className="mt-3 block text-[11.5px] leading-relaxed text-white/45">
              Sent straight to Smartsupp as <code>_smartsupp.color</code>, so the chat bubble matches
              the wallet instead of Smartsupp&apos;s default blue. It can also be set in Smartsupp →
              Settings → Chat box → Appearance.
            </span>
          </label>
        </div>

        <label className="mt-4 block">
          <span className={labelClass}>Greeting (optional)</span>
          <input
            value={draft.welcomeMessage ?? ""}
            onChange={(event) => update({ welcomeMessage: event.target.value.slice(0, 160) })}
            placeholder="Hi! How can we help with your account today?"
            className={fieldClass}
          />
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => update({ enabled: event.target.checked })}
              className="h-4 w-4 accent-emerald-400"
            />
            <span className="font-display text-[12.5px] font-semibold text-white">
              Load chat on customer pages
            </span>
          </label>

          <button
            type="button"
            onClick={save}
            disabled={busy !== null}
            className="ml-auto flex items-center gap-2 rounded-xl bg-fm-lime px-4 py-3 font-display text-[12.5px] font-semibold text-fm-ink transition-colors hover:bg-fm-lime/85 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save integration
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <h3 className="font-display text-[13.5px] font-semibold text-white">What will load</h3>

          <p className="mt-3.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 font-mono text-[10.5px] leading-relaxed break-all text-white/55">
            {loaderUrl ?? "Nothing — add a provider key to load a widget."}
          </p>

          <dl className="mt-4 space-y-2.5 text-[12px] text-white/55">
            <div className="flex items-center justify-between gap-4">
              <dt>Status</dt>
              <dd className={live ? "text-fm-lime" : "text-white/70"}>
                {live ? "Live on customer pages" : "Not loading"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Console</dt>
              <dd className="text-white/70">Excluded automatically</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Position</dt>
              <dd className="text-white/70">{draft.position === "left" ? "Bottom left" : "Bottom right"}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={toggle}
            disabled={busy !== null}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-3 font-display text-[12.5px] font-semibold text-white/85 transition-colors hover:bg-white/8 disabled:opacity-50"
          >
            {busy === "toggle" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : settings.enabled ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {settings.enabled ? "Pause live chat" : "Resume live chat"}
          </button>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <h3 className="font-display text-[13.5px] font-semibold text-white">How it reaches customers</h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
            The provider&apos;s own chat bubble loads on every wallet screen (Home included) and opens a
            conversation with a real agent. Nothing else is added on top of it.
          </p>
        </div>

        <p className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5 text-[11.5px] leading-relaxed text-white/45">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-fm-lime" />
          These are the provider&apos;s public client-side widget keys — the same values that appear in
          any installation snippet. Never paste a provider API secret here.
        </p>
      </div>
    </div>
  );
}
