"use client";
import React from 'react';

import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";

import { logOutAction } from "@/lib/actions/auth";

/**
 * Ends the Supabase session on the server and returns to the landing page.
 *
 * A server action is used rather than a client-side `signOut()` so the session
 * cookies are cleared by the same code path that owns them.
 */
export function SignOutButton({
  className,
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        // The action redirects; keep the button disabled while that happens.
        void logOutAction();
      }}
      className={className}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      {label}
    </button>
  );
}
