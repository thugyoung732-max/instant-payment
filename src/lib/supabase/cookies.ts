/**
 * Cookie types for the server-side Supabase adapters.
 *
 * Why this file exists: `createServerClient` types its `cookies` option as a
 * union of the current `getAll`/`setAll` adapter and the deprecated
 * `get`/`set`/`remove` one. TypeScript cannot contextually type an inline object
 * literal against a union like that, so `setAll(cookiesToSet)` silently becomes
 * an implicit `any` under `strict` — the build error this module fixes. The
 * parameter is annotated explicitly against the shapes below instead.
 */

/**
 * A refreshed cookie's options, as @supabase/ssr emits them.
 *
 * The library defines this as `Partial<CookieSerializeOptions>` (the `cookie`
 * package), which is why `sameSite` still carries the legacy booleans. Only the
 * properties Supabase actually sets are listed; every one is optional so the
 * annotated `setAll` stays assignable to the library's own contract.
 */
export type SupabaseCookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  /** `true` = Strict, `false` = omit — the legacy form Next no longer accepts. */
  sameSite?: boolean | "lax" | "strict" | "none";
  priority?: "low" | "medium" | "high";
  partitioned?: boolean;
};

/** One cookie handed to `setAll` after a session refresh. */
export type CookieToSet = {
  name: string;
  value: string;
  options?: SupabaseCookieOptions;
};

/** The options Next's `ResponseCookies.set` accepts as its third argument. */
export type NextCookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  priority?: "low" | "medium" | "high";
  partitioned?: boolean;
};

/**
 * Maps a Supabase cookie-options bag onto Next's response-cookie options.
 *
 * The only real conversion is `sameSite`: @supabase/ssr inherits `cookie`'s
 * legacy booleans (`true` = Strict, `false` = drop the attribute), while Next's
 * `ResponseCookie` accepts the string form only. Everything else passes through
 * untouched, so a refreshed session keeps its path, expiry and security flags.
 */
export function toNextCookieOptions(options?: SupabaseCookieOptions): NextCookieOptions {
  if (!options) return {};

  const sameSite =
    options.sameSite === true ? "strict" : options.sameSite === false ? undefined : options.sameSite;

  return {
    domain: options.domain,
    path: options.path,
    maxAge: options.maxAge,
    expires: options.expires,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite,
    priority: options.priority,
    partitioned: options.partitioned,
  };
}
