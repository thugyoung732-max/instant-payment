import React from 'react';

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Render the wordmark next to the glyph. */
  showWord?: boolean;
  tone?: "ink" | "light";
};

/**
 * INSTANT PAYMENT mark: a wallet notch cut into a rising bar, so the glyph
 * reads as both a card and a growth chart without leaning on a generic coin.
 */
export function BrandMark({ className, showWord = true, tone = "ink" }: BrandMarkProps) {
  const text = tone === "ink" ? "text-foreground" : "text-white";
  const plate = tone === "ink" ? "bg-fm-ink" : "bg-white/10";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-[11px] shadow-[0_6px_18px_-8px_rgba(7,24,20,0.7)]",
          plate,
        )}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
          <path
            d="M4 17.5V9.2C4 7.4 5.4 6 7.2 6h9.6C18.6 6 20 7.4 20 9.2v6.3"
            stroke="#16c78b"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path d="M4 17.5h9.4" stroke="#c8f24a" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="17.4" cy="17.5" r="2.6" fill="#c8f24a" />
        </svg>
      </span>
      {showWord ? (
        <span
          className={cn(
            "font-display text-[13.5px] font-bold uppercase leading-none tracking-[0.06em]",
            text,
          )}
        >
          Instant Payment
        </span>
      ) : null}
    </span>
  );
}
