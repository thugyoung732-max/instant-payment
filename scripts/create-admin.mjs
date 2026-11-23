/**
 * Creates (or promotes) an INSTANT PAYMENT account with console access.
 *
 * Usage, from the project root:
 *   node scripts/create-admin.mjs <username> <email> <password>
 *
 * The handle is normalised the same way the sign-up form does it (leading "@"
 * dropped, lower-cased), the password is hashed with the app's own bcrypt
 * settings, and an existing account with that handle is promoted rather than
 * duplicated. Credentials are passed as arguments, never stored in this file.
 *
 * Run it as a one-off, then delete it if you don't want it in the repo.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Mirrors src/server/actions/auth.ts so a scripted account looks like a signup.
const HUES = [156, 172, 142, 196, 214, 262, 24, 340];

/** Minimal .env reader — Next.js loads these for the app; plain node does not. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const root = process.cwd();
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.development.local"));

const [, , rawUsername, rawEmail, rawPassword] = process.argv;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!rawUsername || !rawEmail || !rawPassword) {
  fail("Usage: node scripts/create-admin.mjs <username> <email> <password>");
}

const username = rawUsername.trim().replace(/^@+/, "").toLowerCase();
const email = rawEmail.trim().toLowerCase();

if (!USERNAME_PATTERN.test(username)) {
  fail("Usernames are 3-20 characters: letters, numbers or underscore.");
}
if (!EMAIL_PATTERN.test(email)) fail("Enter a valid email address.");
if (rawPassword.length < 8) fail("Use a password of at least 8 characters.");
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set — cannot reach the database.");

const displayName = username
  .split(/[_\s]+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

function hueFor(value) {
  let total = 0;
  for (const char of value) total += char.charCodeAt(0);
  return HUES[total % HUES.length];
}

const prisma = new PrismaClient();

try {
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const byHandle = await prisma.user.findUnique({
    where: { username },
    select: { id: true, isAdmin: true, displayName: true },
  });

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { username: true },
  });
  if (byEmail && byEmail.username !== username) {
    fail(`That email already belongs to @${byEmail.username}. Use a different one.`);
  }

  // Another account whose display name is this handle would be confusing on
  // screen, so it is refused the same way the sign-up form refuses it.
  const nameClash = await prisma.user.findFirst({
    where: {
      OR: [
        { displayName: { equals: username, mode: "insensitive" } },
        { displayName: { equals: `@${username}`, mode: "insensitive" } },
        { username: { equals: displayName.toLowerCase(), mode: "insensitive" } },
      ],
      NOT: { username },
    },
    select: { username: true },
  });
  if (nameClash) {
    fail(`"${displayName}" would collide with @${nameClash.username}. Pick another handle.`);
  }

  const user = byHandle
    ? await prisma.user.update({
        where: { username },
        data: { email, passwordHash, isAdmin: true },
        select: { id: true, username: true, email: true, displayName: true, isAdmin: true },
      })
    : await prisma.user.create({
        // Console accounts open at $0.00 like everyone else; balances only ever
        // move through the ledger.
        data: {
          email,
          username,
          displayName,
          passwordHash,
          avatarHue: hueFor(username),
          isAdmin: true,
          balanceCents: 0,
        },
        select: { id: true, username: true, email: true, displayName: true, isAdmin: true },
      });

  // Proves the stored hash really matches the password just given.
  const stored = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const passwordOk = await bcrypt.compare(rawPassword, stored.passwordHash);

  const admins = await prisma.user.count({ where: { isAdmin: true } });

  console.log(
    JSON.stringify(
      {
        action: byHandle ? (byHandle.isAdmin ? "already admin — credentials reset" : "promoted to admin") : "created",
        user,
        passwordVerified: passwordOk,
        adminCount: admins,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
