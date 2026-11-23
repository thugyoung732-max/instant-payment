/**
 * Avatar source resolution.
 *
 * Profile pictures live in Supabase as small data URLs on the profile row. They
 * are served back through this app's own avatar route, so a component only ever
 * holds a short cacheable URL — never a multi-kilobyte string inside the RSC
 * payload of every page that renders a face.
 */

export function avatarSrc(
  username: string | undefined,
  updatedAt: Date | string | null | undefined,
): string | null {
  if (!username || !updatedAt) return null;

  const stamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();

  return `/api/avatar/${encodeURIComponent(username.toLowerCase())}?v=${
    Number.isNaN(stamp) ? 0 : stamp
  }`;
}
