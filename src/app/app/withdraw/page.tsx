import React from 'react';

import { Info } from "lucide-react";

import { WithdrawForm } from "@/components/fairmoney/withdraw-form";
import { requireProfile } from "@/lib/auth";

export default async function WithdrawPage() {
  const profile = await requireProfile();

  return (
    <div className="space-y-8">
      <header className="fm-rise">
        <p className="fm-label">Withdraw funds</p>
        <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          Withdraw to an account
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          Choose where the money should go, then confirm. Only the amount you ask for is held from
          your balance while the request is reviewed — no fees are charged.
        </p>
      </header>

      <WithdrawForm balanceCents={profile.balanceCents} />

      <p className="fm-notice border border-border bg-card/70 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        You can follow the status of every request in Activity. Pending withdrawals show as
        Processing until they are reviewed.
      </p>
    </div>
  );
}
