import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import { SECRET_KEY, TOKEN_HOURS } from "./config";
import { ApiError } from "./http";
import type { User } from "@/app/generated/prisma";

const ITER = 200_000;
const key = () => new TextEncoder().encode(SECRET_KEY);

const userInclude = { freelancer: true, client: true } as const;

export type AuthUser = User & {
  freelancer: NonNullable<Awaited<ReturnType<typeof prisma.freelancerProfile.findUnique>>> | null;
  client: NonNullable<Awaited<ReturnType<typeof prisma.clientProfile.findUnique>>> | null;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const dk = pbkdf2Sync(password, salt, ITER, 32, "sha256");
  return `pbkdf2_sha256$${ITER}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
    const iters = Number(parts[1]);
    const salt = Buffer.from(parts[2], "base64");
    const dk = Buffer.from(parts[3], "base64");
    const calc = pbkdf2Sync(password, salt, iters, dk.length, "sha256");
    return timingSafeEqual(calc, dk);
  } catch {
    return false;
  }
}

export async function createToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${TOKEN_HOURS}h`)
    .sign(key());
}

export async function decodeToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const sub = payload.sub;
    return sub ? Number(sub) : null;
  } catch {
    return null;
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() || null;
}

export async function loadUser(id: number): Promise<AuthUser | null> {
  return prisma.user.findUnique({ where: { id }, include: userInclude }) as Promise<AuthUser | null>;
}

export async function optionalUser(req: Request): Promise<AuthUser | null> {
  const token = bearer(req);
  if (!token) return null;
  const uid = await decodeToken(token);
  if (!uid) return null;
  const user = await loadUser(uid);
  return user && user.isActive ? user : null;
}

export async function currentUser(req: Request): Promise<AuthUser> {
  const token = bearer(req);
  if (!token) throw new ApiError(401, "Sign in to continue");
  const uid = await decodeToken(token);
  if (!uid) throw new ApiError(401, "Sign in to continue");
  const user = await loadUser(uid);
  if (!user) throw new ApiError(401, "Sign in to continue");
  if (!user.isActive) throw new ApiError(403, "This account is suspended. Contact support for help.");
  return user;
}

export async function requireRole(req: Request, role: string | string[]): Promise<AuthUser> {
  const user = await currentUser(req);
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(user.role)) {
    if (roles.includes("admin")) throw new ApiError(403, "Admin access required");
    if (roles.includes("client")) throw new ApiError(403, "This action is for client accounts");
    if (roles.includes("freelancer")) throw new ApiError(403, "This action is for freelancer accounts");
    throw new ApiError(403, "Forbidden");
  }
  return user;
}

export async function memberOnly(req: Request): Promise<AuthUser> {
  const user = await currentUser(req);
  if (user.role === "admin") throw new ApiError(403, "Not available for admin accounts");
  return user;
}

/** Stable client IP-ish key for throttling (best-effort on Vercel). */
export function clientKey(req: Request, email: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "?";
  return `${ip}|${email}`;
}

const fails = new Map<string, number[]>();
const WINDOW = 900;
const LIMIT = 8;

export function checkThrottle(key: string) {
  const now = Date.now() / 1000;
  const hits = (fails.get(key) || []).filter((t) => now - t < WINDOW);
  fails.set(key, hits);
  if (hits.length >= LIMIT) {
    throw new ApiError(429, "Too many failed attempts. Try again in a few minutes.");
  }
}

export function recordFail(key: string) {
  const hits = fails.get(key) || [];
  hits.push(Date.now() / 1000);
  fails.set(key, hits);
}

export function clearFails(key: string) {
  fails.delete(key);
}

export function pickColor(): string {
  const colors = [
    "#0071e3",
    "#5e5ce6",
    "#bf5af2",
    "#ff375f",
    "#ff9f0a",
    "#30b0c7",
    "#34c759",
    "#ac8e68",
  ];
  return colors[createHash("sha256").update(String(Date.now()) + Math.random()).digest()[0]! % colors.length]!;
}
