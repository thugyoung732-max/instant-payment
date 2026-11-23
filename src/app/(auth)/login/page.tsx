import React from 'react';

import { redirect } from "next/navigation";

import { AuthForm } from "@/components/fairmoney/auth-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Sign in — INSTANT PAYMENT" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.isAdmin ? "/admin" : "/app");

  return (
    <div>
      <p className="fm-label">Welcome back</p>
      <h1 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
        Sign in to your wallet
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        Use your email or your @handle to sign in.
      </p>

      <p className="fm-notice mt-5 border border-border bg-white/70 text-muted-foreground">
        Review credentials — operations console:{" "}
        <span className="fm-numeric font-mono text-foreground">@ada</span> ·{" "}
        <span className="fm-numeric font-mono text-foreground">sandbox123</span>. Other test
        profiles (@mira, @zoe, @adaeze…) use the same password.
      </p>

      <div className="mt-7">
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
