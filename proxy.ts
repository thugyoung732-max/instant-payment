import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 request interceptor (the renamed `middleware.ts`).
 *
 * `proxy` runs on the Node.js runtime in Next 16 and exists here for one job:
 * refreshing the Supabase session cookie before a page renders, and bouncing
 * signed-out visitors away from the wallet and the console.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the icon routes and the generated OG
     * image — those never need a session and should stay cacheable.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|api/og|api/avatar|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
