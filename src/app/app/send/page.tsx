import React from 'react';

import { SendFlow } from "@/components/fairmoney/send-flow";
import { requireUser } from "@/lib/auth";
import { getRecentContacts } from "@/lib/queries";

export const metadata = { title: "Send money — INSTANT PAYMENT" };

export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const user = await requireUser();
  const { to } = await searchParams;
  const contacts = await getRecentContacts(user.id, 4);

  return (
    <div className="space-y-8">
      <header className="fm-rise">
        <p className="fm-label">New transfer</p>
        <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          Send money
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          Search the handle you want to pay, confirm the amount, and the transfer settles instantly
          — the recipient is credited the moment your balance is debited.
        </p>
      </header>

      <SendFlow
        me={{
          username: user.username,
          displayName: user.displayName,
          balanceCents: user.balanceCents,
        }}
        contacts={contacts}
        initialRecipient={to}
      />
    </div>
  );
}
