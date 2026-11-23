import { NextResponse } from "next/server";

import { createOptionalClient } from "@/lib/supabase/server";

/**
 * Serves a profile picture from the database.
 *
 * Pictures are stored as downscaled data URLs on the profile row (no bucket, no
 * signed URL to leak). This route decodes one and returns real image bytes, so
 * the app can cache it like any other image. It reads the public projection,
 * which exposes the picture and nothing else about the account.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const handle = decodeURIComponent(username ?? "").toLowerCase();

  if (!handle) return new NextResponse(null, { status: 404 });

  const supabase = await createOptionalClient();
  if (!supabase) return new NextResponse(null, { status: 404 });

  const { data } = await supabase
    .from("public_profiles")
    .select("avatar_data_url")
    .eq("username", handle)
    .maybeSingle();

  const dataUrl = typeof data?.avatar_data_url === "string" ? data.avatar_data_url : null;
  if (!dataUrl) return new NextResponse(null, { status: 404 });

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(match[2], "base64");

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": match[1],
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
