import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./auth";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

/** Wrap a route handler: maps HttpError to JSON errors and hides internal errors. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}

const buckets = new Map<string, { n: number; reset: number }>();
/** Simple fixed-window limiter (per instance). */
export function limit(req: Request, key: string, max: number, windowMs: number) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || b.reset < now) {
    buckets.set(k, { n: 1, reset: now + windowMs });
    return;
  }
  b.n++;
  if (b.n > max) throw new HttpError(429, "Too many attempts. Please wait a minute and try again.");
}

export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(+v) ? +v : null);

/** Normalise SA phone numbers to +27 format. */
export function normPhone(v: unknown) {
  let p = str(v, 30).replace(/[\s()-]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (/^0\d{9}$/.test(p)) p = "+27" + p.slice(1);
  if (/^27\d{9}$/.test(p)) p = "+" + p;
  return /^\+\d{9,14}$/.test(p) ? p : null;
}
