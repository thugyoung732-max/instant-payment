"use client";
import React from 'react';

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Laptop },
] as const;

/** Three-way appearance switch: Light, Dark or follow the device (default). */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const active = mounted ? (theme ?? "system") : "system";

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-3 gap-1.5 rounded-[20px] border border-border bg-secondary/50 p-1.5"
      >
        {OPTIONS.map((option) => {
          const selected = active === option.id;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(option.id)}
              className={`flex items-center justify-center gap-2 rounded-[15px] px-3 py-3 font-display text-[13px] font-semibold transition-colors ${
                selected
                  ? "bg-card text-foreground shadow-[0_10px_24px_-20px_rgba(7,24,20,0.7)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2.1} />
              {option.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        System follows your device setting
        {mounted && resolvedTheme ? ` — currently ${resolvedTheme}.` : "."}
      </p>
    </div>
  );
}
