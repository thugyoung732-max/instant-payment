import React from 'react';

import { redirect } from "next/navigation";

import { AuthForm } from "@/components/fairmoney/auth-form";
import { getSessionProfile } from "@/lib/auth";

export default async function SignUpPage() {
  const profile = await getSessionProfile();
  if (profile) redirect(profile.isAdmin ? "/admin" : "/app");

  return (
    <div>
      <p className="fm-label">Open an account</p>
      <h1 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
        Claim your @handle
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        Your handle is the address people use to send you money, so pick one you like — it stays
        yours and is unique on INSTANT PAYMENT.
      </p>

      <div className="mt-7">
        <AuthForm mode="signup" />
      </div>
    </div>
  );
}
