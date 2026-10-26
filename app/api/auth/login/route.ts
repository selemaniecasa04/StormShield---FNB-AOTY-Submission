import { one } from "@/lib/db";
import { checkPassword, homeFor, startSession, type Role } from "@/lib/auth";
import { body, handle, json, limit, normPhone, str } from "@/lib/http";

const DEMO_EMAIL: Record<string, string> = {
  thandi: "thandi@stormshield.demo",
  pieter: "pieter@stormshield.demo",
  selemani: "selemani@stormshield.demo",
  ayanda: "ayanda@stormshield.demo",
  insurer: "claims@shieldsure.demo",
  admin: "selemani@stormshield.demo",
};

export const POST = handle(async (req: Request) => {
  limit(req, "login", 15, 60_000);
  const b = await body(req);
  const id = str(b.identifier, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  // Demo shortcut: one-tap sign-in as a seeded demo account.
  const demo = str(b.demo, 20);
  if (demo) {
    const email = DEMO_EMAIL[demo];
    const u = email ? await one<{ id: number; role: Role; first_name: string }>(`SELECT id, role, first_name FROM users WHERE email = $1 AND demo = true`, [email]) : null;
    if (!u) return json({ error: "Demo account not available." }, 404);
    await startSession({ uid: u.id, role: u.role, name: u.first_name });
    return json({ ok: true, redirect: homeFor(u.role) });
  }
  if (!id || !password) return json({ error: "Enter your email, phone or username and password." }, 400);
  const phone = normPhone(id);
  // Email, phone number, or the part of the email before "@" (e.g. "selemani").
  const u = await one<{ id: number; role: Role; first_name: string; password_hash: string }>(
    `SELECT id, role, first_name, password_hash FROM users WHERE email = $1 OR phone = $2 OR split_part(email, '@', 1) = $1 ORDER BY (email = $1) DESC LIMIT 1`,
    [id, phone ?? "-"],
  );
  if (!u || !(await checkPassword(password, u.password_hash))) {
    return json({ error: "Those details don't match an account." }, 401);
  }
  await startSession({ uid: u.id, role: u.role, name: u.first_name });
  return json({ ok: true, redirect: homeFor(u.role) });
});
