import { type NextRequest, NextResponse } from "next/server";

import { getAvatar } from "@/lib/profiles";

/**
 * Serves a stored profile picture. Bytes live in the database (small, already
 * downscaled in the browser) and the URL carries an updatedAt stamp, so the
 * response can be cached hard by the browser and the preview CDN alike.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  const avatar = await getAvatar(decodeURIComponent(username).toLowerCase());
  if (!avatar) {
    return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
  }

  const body = new Uint8Array(avatar.bytes);

  return new NextResponse(body, {
    headers: {
      "content-type": avatar.mimeType,
      "content-length": String(body.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
