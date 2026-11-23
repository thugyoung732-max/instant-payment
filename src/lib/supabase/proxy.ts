import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "./env";

const PROTECTED_PREFIXES = ["/app", "/admin"];
const GUEST_ONLY_PREFIXES = ["/login", "/signup"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the Supabase session on every request and enforces the sign-in
 * boundary.
 *
 * Two things matter here, and both are easy to get wrong:
 *
 * 1. `getUser()` — not `getSession()` — is called so the access token is
 *    verified with the auth server rather than trusted from the cookie.
 * 2. The response object is rebuilt whenever cookies are refreshed. If you
 *    return the original response, the browser keeps the expired token and the
 *    session silently dies mid-visit.
 *
 * Administrator rights are NOT decided here: `/admin` additionally re-checks the
 * profile server-side and the database enforces `is_admin` inside every
 * administrative function, so a forged request cannot become an admin action.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = supabaseUrl();
  const key = supabasePublishableKey();

  // Without credentials there is nothing to refresh; the pages explain the
  // missing configuration instead of redirecting in a loop.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && matches(pathname, PROTECTED_PREFIXES)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    const target = `${pathname}${search}`;
    if (target !== "/app") redirect.searchParams.set("next", target);
    return redirectWithCookies(redirect, response);
  }

  if (user && matches(pathname, GUEST_ONLY_PREFIXES)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/app";
    redirect.search = "";
    return redirectWithCookies(redirect, response);
  }

  return response;
}

/** Keeps refreshed auth cookies on a redirect response. */
function redirectWithCookies(target: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(target);
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
