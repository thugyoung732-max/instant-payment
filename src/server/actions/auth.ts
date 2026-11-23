"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkIdentityAvailable } from "@/lib/profiles";
import { firstIssue, logInSchema, normaliseUsername, signUpSchema } from "@/lib/validation";

export type AuthState = { error: string | null };

const HUES = [156, 172, 142, 196, 214, 262, 24, 340];

function hueForUsername(username: string): number {
  let total = 0;
  for (const char of username) total += char.charCodeAt(0);
  return HUES[total % HUES.length];
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email") ?? "",
    username: formData.get("username") ?? "",
    displayName: formData.get("displayName") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { email, username, displayName, password } = parsed.data;

  const emailTaken = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (emailTaken) {
    return { error: "That email already has an INSTANT PAYMENT account." };
  }

  // The handle must be free, and the handle and name must not collide with
  // another account's identity — two interchangeable accounts are confusing.
  const identity = await checkIdentityAvailable({ username, displayName });
  if (!identity.ok) return { error: identity.error };

  const passwordHash = await hashPassword(password);

  try {
    // New accounts open at exactly $0.00 — no opening balance, no bonus, no
    // ledger row. Funds only ever arrive through a transfer or a valid sandbox
    // deposit code, both of which are credited server-side.
    const user = await prisma.user.create({
      data: {
        email,
        username,
        displayName,
        passwordHash,
        avatarHue: hueForUsername(username),
        isAdmin: false,
        balanceCents: 0,
      },
      select: { id: true },
    });

    await createSession(user.id);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That email or username was just taken. Try another." };
    }
    throw error;
  }

  redirect("/app");
}

export async function logInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = logInSchema.safeParse({
    identifier: formData.get("identifier") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const identifier = parsed.data.identifier.trim().toLowerCase();
  const asUsername = normaliseUsername(identifier);

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: asUsername }] },
    select: { id: true, passwordHash: true, isAdmin: true },
  });

  // Deliberately identical message for unknown user and wrong password.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Those details didn't match an account." };
  }

  await createSession(user.id);
  redirect(user.isAdmin ? "/admin" : "/app");
}

export async function logOutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
