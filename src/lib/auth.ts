import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "fairmoney_session";
const ISSUER = "fairmoney-sandbox";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days of sandbox session

const DEVELOPMENT_SECRET = "fairmoney-development-session-secret-not-for-production";

/**
 * Session signing key. An empty or short value counts as missing — a container
 * that has not materialised the variable yet must not silently sign tokens with
 * a zero-length key. Production refuses to start without a real secret.
 */
export function getSessionSecretKey(): Uint8Array {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured && configured.length >= 16) return new TextEncoder().encode(configured);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is missing or too short — set it to a random string of at least 32 characters.",
    );
  }

  if (!warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn(
      "[fairmoney] AUTH_SECRET is empty in this process — falling back to the development session secret.",
    );
  }
  return new TextEncoder().encode(DEVELOPMENT_SECRET);
}

let warnedAboutSecret = false;

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarHue: number;
  isAdmin: boolean;
  balanceCents: number;
  createdAt: Date;
  avatar: { updatedAt: Date } | null;
};

const sessionSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarHue: true,
  isAdmin: true,
  balanceCents: true,
  createdAt: true,
  avatar: { select: { updatedAt: true } },
} as const;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSessionSecretKey());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Reads the signed session cookie and resolves the live user row, so balance
 * changes are always fresh. Cached per request to avoid repeat queries.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecretKey(), { issuer: ISSUER });
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;

    return await prisma.user.findUnique({ where: { id: userId }, select: sessionSelect });
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/app");
  return user;
}
