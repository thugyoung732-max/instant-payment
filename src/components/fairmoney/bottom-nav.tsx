"use client";
import React from 'react';

import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, LayoutGrid, Receipt, Send, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app", label: "Home", icon: LayoutGrid },
  { href: "/app/send", label: "Send", icon: Send },
  { href: "/app/activity", label: "Activity", icon: Receipt },
  { href: "/app/profile", label: "Profile", icon: User },
] as const;

export function BottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5"
    >
      <div className="pointer-events-auto w-full max-w-[30rem] rounded-[28px] border border-black/5 bg-white/90 p-2 shadow-[0_24px_50px_-24px_rgba(7,24,20,0.5)] backdrop-blur-xl">
        <ul className="grid grid-cols-4 gap-1">
          {TABS.map((tab) => {
            const active =
              tab.href === "/app" ? pathname === "/app" : pathname.startsWith(tab.href);
            const Icon = tab.icon;

            return (
              <li key={tab.href} className="relative">
                {active ? (
                  <motion.span
                    layoutId="fm-nav-pill"
                    className="fm-nav-pill absolute inset-0 rounded-[22px]"
                    transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.7 }}
                  />
                ) : null}
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative z-10 flex flex-col items-center gap-1.5 rounded-[22px] px-1 py-3 text-[11.5px] font-semibold transition-colors ${
                    active ? "text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.9} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {isAdmin ? (
          <Link
            href="/admin"
            className="mt-1.5 flex items-center justify-center gap-2 rounded-[20px] bg-fm-lime/25 px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-fm-ink transition-colors hover:bg-fm-lime/40"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Operations console
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function DirectionIcon({ direction }: { direction: "in" | "out" }) {
  const Icon = direction === "out" ? ArrowUpRight : ArrowDownLeft;
  return (
    <span
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
        direction === "out" ? "bg-fm-ink text-fm-lime" : "bg-accent text-primary"
      }`}
    >
      <Icon className="h-[19px] w-[19px]" strokeWidth={2.2} />
    </span>
  );
}
