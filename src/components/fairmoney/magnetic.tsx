"use client";
import React from 'react';

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useRef, type CSSProperties, type ReactNode } from "react";

type MagneticProps = {
  children: ReactNode;
  /** How far the wrapper follows the pointer, as a fraction of the offset. */
  strength?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Pointer-relative magnetic pull. The wrapper measures the gap between the
 * cursor and its own centre and moves by that offset, then settles back with a
 * deliberately under-damped spring so the return overshoots slightly instead of
 * snapping. Touh pointers are ignored — on a phone the CTA should stay put.
 */
export function Magnetic({ children, strength = 0.32, className, style }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, { stiffness: 150, damping: 15, mass: 0.1 });
  const y = useSpring(targetY, { stiffness: 150, damping: 15, mass: 0.1 });

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    targetX.set((event.clientX - (rect.left + rect.width / 2)) * strength);
    targetY.set((event.clientY - (rect.top + rect.height / 2)) * strength);
  }

  function reset() {
    targetX.set(0);
    targetY.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onBlur={reset}
      style={{ x, y, ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
