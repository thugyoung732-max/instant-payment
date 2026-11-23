import React from 'react';

import { DepositForm, DepositHistoryHint } from "@/components/fairmoney/deposit-form";
import { requireProfile } from "@/lib/auth";

export default async function DepositPage() {
  const profile = await requireProfile();

  return (
    <div className="space-y-8">
      <header className="fm-rise">
        <p className="fm-label">Add money</p>
        <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          Deposit funds
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          Enter your deposit code and the amount you expect it to add. The code is checked here and
          the amount it carries is what gets credited.
        </p>
      </header>

      <DepositForm balanceCents={profile.balanceCents} />
      <DepositHistoryHint />
    </div>
  );
}
