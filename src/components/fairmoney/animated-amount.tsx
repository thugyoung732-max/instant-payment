"use client";
import React from 'react';

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

import { splitUSD } from "@/lib/money";

type AnimatedAmountProps = {
  cents: number;
  className?: string;
  /** Resting colour family, so the movement tint can animate between real values. */
  tone?: "light" | "dark";
};

const REST = { light: "#ffffff", dark: "#071814" } as const;
const UP = { light: "#c8f24a", dark: "#0f8a5f" } as const;
const DOWN = { light: "#ff9f9f", dark: "#c0392b" } as const;

/**
 * Spring-damped money counter. The first paint uses the server value (no
 * hydration mismatch); afterwards a single spring drives it, so a settled
 * transfer reads as the balance physically coming to rest rather than a swap.
 * A brief directional tint marks which way it moved.
 */
export function AnimatedAmount({ cents, className, tone = "light" }: AnimatedAmountProps) {
  const source = useMotionValue(cents);
  const spring = useSpring(source, { stiffness: 90, damping: 22, mass: 0.6 });
  const [value, setValue] = useState(cents);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const unsubscribe = spring.on("change", (latest) => {
      setValue(Math.round(latest));
    });
    return unsubscribe;
  }, [spring]);

  useEffect(() => {
    source.set(cents);
  }, [cents, source]);

  useEffect(() => {
    if (cents === value) return;
    setFlash(cents > value ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [cents, value]);

  const { symbol, whole, fraction } = splitUSD(value);
  const color = flash ? (flash === "up" ? UP[tone] : DOWN[tone]) : REST[tone];

  return (
    <motion.span
      className={`fm-balance-digits inline-flex items-baseline ${className ?? ""}`}
      animate={{ color }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="opacity-60">{symbol}</span>
      <span>{whole}</span>
      <span className="opacity-60">.{fraction}</span>
    </motion.span>
  );
}
