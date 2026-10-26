// Database access. Uses Neon Postgres when DATABASE_URL is set, otherwise an embedded
// PGlite (Postgres in WebAssembly) so the app runs with zero setup.
import "server-only";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { migrate } from "./schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
type Exec = (text: string, params?: unknown[]) => Promise<Row[]>;

const g = globalThis as unknown as { __ssExec?: Promise<Exec>; __ssReady?: Promise<void> };

async function createExec(): Promise<Exec> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return (text, params = []) => sql.query(text, params as any[]) as unknown as Promise<Row[]>;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.VERCEL ? "/tmp/stormshield-pglite" : path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  return async (text, params = []) => (await db.query(text, params as any[])).rows as Row[];
}

function exec() {
  g.__ssExec ??= createExec().catch((e) => {
    g.__ssExec = undefined;
    throw e;
  });
  return g.__ssExec;
}

export async function ready() {
  g.__ssReady ??= (async () => {
    const run = await exec();
    await migrate(run);
  })().catch((e) => {
    g.__ssReady = undefined;
    throw e;
  });
  return g.__ssReady;
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const run = await exec();
  return (await run(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export const usingNeon = () => !!process.env.DATABASE_URL;
