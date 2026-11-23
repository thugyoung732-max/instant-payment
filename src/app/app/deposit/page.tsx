import React from 'react';

import { DepositForm, DepositHistoryHint } from "@/components/fairmoney/deposit-form";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Add money — INSTANT PAYMENT" };

export default async function DepositPage() {
  const user = await requireUser();

  return (
    <div className="space-y-8">
      <header className="fm-rise">
        <p className="fm-label">Add money</p>
        <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          Deposit funds
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          Enter your deposit code and the amount you expect it to add. We verify the code on our
          servers and credit the amount it carries.
        </p>
      </header>

      <DepositForm balanceCents={user.balanceCents} />
      <DepositHistoryHint />
    </div>
  );
}
