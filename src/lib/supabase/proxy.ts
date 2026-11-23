import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { toNextCookieOptions, type CookieToSet } from "./cookies";
import { supabasePublishableKey, supabaseUrl } from "./env";

const PROTECTED_PREFIXES = ["/app", "/admin"];
const GUEST_ONLY_PREFIXES = ["/login", "/signup"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = supabaseUrl();
  const key = supabasePublishableKey();

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, toNextCookieOptions(options));
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

function redirectWithCookies(target: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(target);
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}