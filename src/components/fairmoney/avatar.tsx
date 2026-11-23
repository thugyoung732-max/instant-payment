import React from 'react';

import { avatarSrc } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type AvatarProps = {
  displayName: string;
  hue: number;
  /** When present with a stored picture, the photo replaces the initials tile. */
  username?: string;
  avatarUpdatedAt?: Date | string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return "??";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "??";
}

const SIZES = {
  sm: "h-9 w-9 text-[11px]",
  md: "h-11 w-11 text-xs",
  lg: "h-14 w-14 text-sm",
  xl: "h-20 w-20 text-lg",
} as const;

/** Profile picture with a deterministic initials fallback. */
export function Avatar({
  displayName,
  hue,
  username,
  avatarUpdatedAt,
  size = "md",
  className,
}: AvatarProps) {
  const src = avatarSrc(username, avatarUpdatedAt);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-display font-semibold tracking-wide ring-1 ring-black/5",
        SIZES[size],
        className,
      )}
      style={
        src
          ? undefined
          : {
              backgroundColor: `hsl(${hue} 62% 92%)`,
              color: `hsl(${hue} 64% 24%)`,
              boxShadow: `inset 0 0 0 1px hsl(${hue} 46% 84%)`,
            }
      }
      aria-hidden
    >
      {src ? (
        // Stored bytes are served from this app's own avatar route.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        initialsOf(displayName)
      )}
    </span>
  );
}
