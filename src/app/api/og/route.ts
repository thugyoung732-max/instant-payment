import { ogImageResponse } from "@/lib/og-image";

/**
 * The link-preview card. Served from an explicit route so the absolute URL in
 * the page head is exactly the configured site origin.
 */
export async function GET() {
  return ogImageResponse();
}
