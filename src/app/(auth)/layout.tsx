import React from 'react';

import Link from "next/link";

import { BrandMark } from "@/components/fairmoney/brand";

const PROOF = [
  { k: "Instant", v: "Transfers between handles settle the moment you confirm." },
  { k: "Verified", v: "Every handle is checked before an amount is entered." },
  { k: "Tracked", v: "Each movement keeps its own transaction ID, status and receipt." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-fm-sand">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:px-8">
        <aside className="fm-ambient relative isolate hidden overflow-hidden rounded-[32px] bg-fm-ink p-8 text-white lg:block">
          <div aria-hidden className="fm-grain absolute inset-0 -z-10 opacity-25" />
          <BrandMark tone="light" />

          <h2 className="mt-10 font-display text-[34px] font-semibold leading-[1.1] tracking-tight">
            Your wallet, your handle, your money — right from your phone.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/65">
            Send to anyone&apos;s @handle, add funds with a deposit code and request payouts, with a
            receipt and status for every movement.
          </p>

          <dl className="mt-10 space-y-4">
            {PROOF.map((item) => (
              <div key={item.k} className="border-t border-white/10 pt-3">
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-fm-lime">
                  {item.k}
                </dt>
                <dd className="mt-1 text-[12px] leading-relaxed text-white/60">{item.v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
            Balances verified server-side · every movement receipts
          </p>
        </aside>

        <div className="w-full">
          <div className="lg:hidden">
            <Link href="/">
              <BrandMark />
            </Link>
          </div>
          <div className="mt-6 rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_28px_60px_-40px_rgba(7,24,20,0.65)] sm:p-7">
            {children}
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            <Link href="/" className="hover:text-foreground hover:underline">
              ← Back to the INSTANT PAYMENT overview
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
