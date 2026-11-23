import React from 'react';

import Link from "next/link";

import { Avatar } from "@/components/fairmoney/avatar";
import { BottomNav } from "@/components/fairmoney/bottom-nav";
import { BrandMark } from "@/components/fairmoney/brand";
import { requireProfile } from "@/lib/auth";

/**
 * Wallet shell.
 *
 * The signed-in profile is resolved on the server from the Supabase session
 * cookie, so there is no boot state to wait for: the shell renders with the real
 * identity, and an unauthenticated visitor is redirected before any wallet
 * markup is produced.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="fm-ambient min-h-dvh bg-fm-sand">
      <div className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col border-x border-black/5 bg-fm-sand/85 px-5 pb-44 pt-8 sm:px-7">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/app" className="transition-opacity hover:opacity-80">
            <BrandMark />
          </Link>
          <Link
            href="/app/profile"
            className="flex items-center gap-3 rounded-full border border-black/5 bg-white py-1.5 pl-1.5 pr-4 shadow-[0_10px_24px_-22px_rgba(7,24,20,0.6)] transition-colors hover:bg-white/85"
          >
            <Avatar
              displayName={profile.displayName}
              hue={profile.avatarHue}
              username={profile.username}
              avatarUpdatedAt={profile.avatar?.updatedAt ?? null}
              size="sm"
            />
            <span className="fm-numeric font-mono text-[12px] text-muted-foreground">
              @{profile.username}
            </span>
          </Link>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      <BottomNav isAdmin={profile.isAdmin} />
    </div>
  );
}
