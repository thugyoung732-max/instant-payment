import React from 'react';

import { redirect } from "next/navigation";

import { AuthForm } from "@/components/fairmoney/auth-form";
import { getSessionProfile } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";

export default async function LoginPage() {
  // Signed-in visitors skip the form and go straight to their wallet.
  const profile = await getSessionProfile();
  if (profile) redirect(profile.isAdmin ? "/admin" : "/app");

  return (
    <div>
      <p className="fm-label">Welcome back</p>
      <h1 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
        Sign in to your wallet
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        Use your email or your @handle to sign in.
      </p>

      {supabaseConfigured() ? (
        <p className="fm-notice mt-5 border border-border bg-white/70 text-muted-foreground">
          Sandbox credentials — operations console:{" "}
          <span className="fm-numeric font-mono text-foreground">@ada</span> ·{" "}
          <span className="fm-numeric font-mono text-foreground">sandbox123</span>. Other test
          profiles (@mira, @zoe, @adaeze…) use the same password once{" "}
          <span className="font-mono">supabase/seed.sql</span> has been run.
        </p>
      ) : (
        <p className="fm-notice mt-5 border border-amber-500/25 bg-amber-50/80 text-amber-900">
          Supabase is not configured yet. Add{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</span> to{" "}
          <span className="font-mono">.env</span>, then run{" "}
          <span className="font-mono">supabase/schema.sql</span>.
        </p>
      )}

      <div className="mt-7">
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
