import { markIconResponse } from "@/lib/brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * iOS home-screen / share icon, generated from the same mark as the favicon so
 * no bitmap asset has to ship with the repo.
 */
export default function AppleIcon() {
  return markIconResponse(180);
}
