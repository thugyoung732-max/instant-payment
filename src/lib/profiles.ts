import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normaliseNameForCompare } from "@/lib/validation";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB after client-side downscaling
export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type ProfileUpdateResult =
  | { ok: true; username: string; displayName: string }
  | { ok: false; error: string };

export type IdentityAvailability = { ok: true } | { ok: false; error: string };

/**
 * Keeps a visible identity unambiguous.
 *
 * The unique index already makes two identical handles impossible; on top of
 * that a handle may not duplicate another account's display name, and a display
 * name may not duplicate another account's handle — otherwise two accounts can
 * look interchangeable in a transfer, an activity row or the console.
 */
export async function checkIdentityAvailable(params: {
  userId?: string;
  username: string;
  displayName: string;
}): Promise<IdentityAvailability> {
  const { username, displayName } = params;
  const notSelf = params.userId ? { NOT: { id: params.userId } } : {};

  const [handleTaken, nameIsHandle, handleIsName] = await Promise.all([
    prisma.user.findFirst({ where: { username, ...notSelf }, select: { id: true } }),
    prisma.user.findFirst({
      where: { username: normaliseNameForCompare(displayName), ...notSelf },
      select: { username: true },
    }),
    prisma.user.findFirst({
      where: {
        OR: [
          { displayName: { equals: username, mode: "insensitive" } },
          { displayName: { equals: `@${username}`, mode: "insensitive" } },
        ],
        ...notSelf,
      },
      select: { username: true },
    }),
  ]);

  if (handleTaken) return { ok: false, error: `@${username} is already taken.` };

  if (nameIsHandle) {
    return {
      ok: false,
      error: `That name would be confusing — @${nameIsHandle.username} already uses it. Choose a different name.`,
    };
  }

  if (handleIsName) {
    return {
      ok: false,
      error: `That name belongs to @${handleIsName.username}, so @${username} would be confusing. Choose a different handle.`,
    };
  }

  return { ok: true };
}

/**
 * Updates handle and display name. The identity check gives a clear message and
 * the unique index remains the real guarantee (a concurrent signup racing for
 * the same handle surfaces as P2002).
 */
export async function updateProfile(params: {
  userId: string;
  username: string;
  displayName: string;
}): Promise<ProfileUpdateResult> {
  const { userId, username, displayName } = params;

  const availability = await checkIdentityAvailable({ userId, username, displayName });
  if (!availability.ok) return { ok: false, error: availability.error };

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { username, displayName },
      select: { username: true, displayName: true },
    });
    return { ok: true, ...updated };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: `@${username} is already taken.` };
    }
    throw error;
  }
}

export type AvatarSaveResult = { ok: true } | { ok: false; error: string };

/** Stores the profile picture bytes. Old picture is replaced, never duplicated. */
export async function saveAvatar(params: {
  userId: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<AvatarSaveResult> {
  const { userId, bytes, mimeType } = params;

  if (!(ALLOWED_AVATAR_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, error: "Use a JPG, PNG, WEBP or GIF image." };
  }
  if (bytes.byteLength === 0) return { ok: false, error: "That file looks empty." };
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Profile pictures need to be under 2 MB." };
  }

  // Copied into a plain ArrayBuffer-backed array so Prisma's Bytes field accepts
  // it regardless of how the caller allocated the input.
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);

  await prisma.avatar.upsert({
    where: { userId },
    create: { userId, bytes: payload, mimeType },
    update: { bytes: payload, mimeType },
  });

  return { ok: true };
}

export async function removeAvatar(userId: string): Promise<void> {
  await prisma.avatar.deleteMany({ where: { userId } });
}

export async function getAvatar(username: string) {
  return prisma.avatar.findFirst({
    where: { user: { username } },
    select: { bytes: true, mimeType: true, updatedAt: true },
  });
}
