"use client";
import React from 'react';

import { ArrowRight, CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Magnetic } from "@/components/fairmoney/magnetic";
import { logInAction, signUpAction, type AuthState } from "@/server/actions/auth";

const INITIAL: AuthState = { error: null };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "login" ? logInAction : signUpAction;
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-6">
      {mode === "signup" ? (
        <>
          <div>
            <label className="fm-label block" htmlFor="displayName">
              Name
            </label>
            <input
              id="displayName"
              name="displayName"
              required
              autoComplete="name"
              placeholder="Ada Lovelace"
              className="fm-field mt-3.5"
            />
          </div>

          <div>
            <label className="fm-label block" htmlFor="username">
              Handle
            </label>
            <div className="mt-3.5 flex items-center gap-2.5 rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 transition-colors focus-within:border-primary/45 focus-within:bg-white">
              <span className="font-display text-[17px] font-semibold text-muted-foreground">@</span>
              <input
                id="username"
                name="username"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="ada"
                className="fm-numeric min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
              Your handle is how people send you money · 3–20 letters, numbers or underscores.
            </p>
          </div>

          <div>
            <label className="fm-label block" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="ada@example.com"
              className="fm-field mt-3.5"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="fm-label block" htmlFor="identifier">
            Email or @handle
          </label>
          <input
            id="identifier"
            name="identifier"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ada@example.com or @ada"
            className="fm-field mt-3.5"
          />
        </div>
      )}

      <div>
        <label className="fm-label block" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode === "login" ? "••••••••" : "At least 8 characters"}
          className="fm-field mt-3.5"
        />
      </div>

      {state.error ? (
        <p className="fm-notice border border-destructive/25 bg-destructive/8 text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <Magnetic className="w-full" strength={0.14}>
        <button type="submit" disabled={pending} className="fm-btn fm-btn-primary w-full">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === "login" ? "Signing in" : "Creating account"}
            </>
          ) : (
            <>
              {mode === "login" ? "Sign in" : "Create your account"}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </Magnetic>

      <p className="text-center text-[13.5px] text-muted-foreground">
        {mode === "login" ? (
          <>
            New to INSTANT PAYMENT?{" "}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>

      {mode === "signup" ? (
        <p className="fm-notice border border-border bg-white/70 text-muted-foreground">
          Your account opens at{" "}
          <span className="fm-numeric font-semibold text-foreground">$0.00</span>. Add funds with a
          deposit code issued for your account, or receive a transfer from another INSTANT PAYMENT
          handle.
        </p>
      ) : null}
    </form>
  );
}
