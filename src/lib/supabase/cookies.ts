export type SupabaseCookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  priority?: "low" | "medium" | "high";
  partitioned?: boolean;
};

export type CookieToSet = {
  name: string;
  value: string;
  options?: SupabaseCookieOptions;
};

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