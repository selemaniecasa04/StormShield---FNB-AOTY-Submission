import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { one } from "./db";

const COOKIE = "ss_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") {
    console.warn("AUTH_SECRET is not set – using the demo secret. Set AUTH_SECRET before real use.");
  }
  return new TextEncoder().encode(s || "stormshield-demo-secret-change-me-0123456789");
}

export type Role = "user" | "admin" | "insurer";
export const homeFor = (role: Role) => (role === "admin" ? "/admin" : role === "insurer" ? "/insurer" : "/dashboard");

export interface Session {
  uid: number;
  role: Role;
  name: string;
}

export async function hashPassword(p: string) {
  return bcrypt.hash(p, 10);
}
export async function checkPassword(p: string, hash: string) {
  return bcrypt.compare(p, hash);
}

export async function startSession(s: Session) {
  const token = await new SignJWT({ role: s.role, name: s.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(s.uid))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  // Secure cookies on HTTPS (Vercel); plain HTTP is allowed for local `npm start`.
  const h = await headers();
  const https = h.get("x-forwarded-proto") === "https" || process.env.VERCEL === "1";
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const uid = Number(payload.sub);
    // Confirm the account still exists (it may have been deleted) and use the stored role.
    const u = await one<{ role: Role; first_name: string }>(`SELECT role, first_name FROM users WHERE id = $1`, [uid]);
    if (!u) return null;
    return { uid, role: u.role, name: u.first_name };
  } catch {
    return null;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser() {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Please sign in.");
  return s;
}

export async function requireInsurer() {
  const s = await requireUser();
  if (s.role !== "insurer") throw new HttpError(403, "Insurer staff only.");
  return s;
}

export async function requireAdmin() {
  const s = await requireUser();
  if (s.role !== "admin") throw new HttpError(403, "Admins only.");
  return s;
}
