import React from 'react';

import Link from "next/link";

import { Avatar } from "@/components/fairmoney/avatar";
import { BottomNav } from "@/components/fairmoney/bottom-nav";
import { BrandMark } from "@/components/fairmoney/brand";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

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
              displayName={user.displayName}
              hue={user.avatarHue}
              username={user.username}
              avatarUpdatedAt={user.avatar?.updatedAt ?? null}
              size="sm"
            />
            <span className="fm-numeric font-mono text-[12px] text-muted-foreground">
              @{user.username}
            </span>
          </Link>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
