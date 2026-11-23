/**
 * Client-safe avatar URL helper. The stamp busts the immutable cache whenever
 * the stored picture is replaced.
 */
export function avatarSrc(
  username: string | undefined,
  updatedAt: Date | string | null | undefined,
): string | null {
  if (!username || !updatedAt) return null;
  const stamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
  return `/api/avatar/${encodeURIComponent(username)}?v=${Number.isNaN(stamp) ? 0 : stamp}`;
}
