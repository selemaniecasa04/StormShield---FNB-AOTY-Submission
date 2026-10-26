// Shared server helpers for the feature-phone channels (USSD + voice keypad).
import "server-only";
import { randomBytes } from "node:crypto";
import { q, one } from "./db";
import { hashPassword } from "./auth";
import { ZONE_BY_ID, type LatLng } from "./geo";
import type { UserRow } from "./users";

export const SANDBOX_PREFIX = "+2779"; // numbers the on-screen simulator may create

export type PhoneUser = UserRow;

export async function userByPhone(phone: string) {
  return one<UserRow>(`SELECT * FROM users WHERE phone = $1`, [phone]);
}

/** The on-screen simulator may act only as demo residents or as new sandbox numbers. A real gateway is trusted via a shared secret. */
export function simulatorMayUse(phone: string, u: UserRow | null) {
  if (process.env.PHONE_SIMULATOR === "off") return false;
  if (u) return u.demo && u.role === "user";
  return /^\+2779\d{7}$/.test(phone);
}

export function gatewayTrusted(req: Request) {
  const secret = process.env.USSD_SHARED_SECRET;
  return !!secret && secret.length >= 16 && req.headers.get("x-ussd-secret") === secret;
}

export async function sms(eventId: number, userId: number | null, toName: string, toPhone: string, body: string, channel: "sms" | "push" | "voice" = "sms") {
  await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,$5,$6)`, [eventId, userId, toName, toPhone, channel, body]);
}

export const fullName = (u: { first_name: string; surname: string }) => `${u.first_name}${u.surname ? ` ${u.surname}` : ""}`;

export function userPoint(u: UserRow): LatLng {
  return u.gps_lat != null && u.gps_lng != null && u.gps_at && Date.now() - new Date(u.gps_at).getTime() < 6 * 3_600_000 ? [u.gps_lat, u.gps_lng] : [u.home_lat, u.home_lng];
}

/** A response by phone counts as a response: stop any calls still queued or ringing. */
export async function stopOutreach(eventId: number, userId: number, result: string) {
  await q(
    `UPDATE outreach_targets SET status = 'reached', result = $3, updated_at = now() WHERE event_id = $1 AND user_id = $2 AND status IN ('queued','ringing','in_call')`,
    [eventId, userId, result],
  );
}

/** Tell everyone who has this person in their family circle (app users) and update their family card. */
export async function notifyFamily(eventId: number, u: UserRow, status: string | null, text: string) {
  const rows = await q<{ id: number; user_id: number; linked_user_id: number | null; first_name: string; surname: string; phone: string }>(
    `SELECT f.id, f.user_id, f.linked_user_id, o.first_name, o.surname, o.phone FROM family f JOIN users o ON o.id = f.user_id
     WHERE (f.linked_user_id = $1 OR f.phone = $2) AND f.user_id <> $1`,
    [u.id, u.phone],
  );
  for (const r of rows) {
    if (status && r.linked_user_id !== u.id) await q(`UPDATE family SET status = $2, status_event = $3, status_at = now() WHERE id = $1`, [r.id, status, eventId]);
    await sms(eventId, r.user_id, fullName(r), r.phone, text, "push");
    await sms(eventId, r.user_id, fullName(r), r.phone, text, "sms");
  }
  return rows.map((r) => fullName(r));
}

/** Add a line to any open help requests (e.g. a welfare check) so responders see the latest news. */
export async function noteOpenTickets(eventId: number, userId: number, line: string) {
  await q(`UPDATE tickets SET note = coalesce(note, '') || $3, updated_at = now() WHERE event_id = $1 AND user_id = $2 AND status <> 'resolved'`, [eventId, userId, ` [${line}]`]);
}

/** Minimal account for someone who registers (or asks for help) from a basic phone. */
export async function createPhoneUser(o: { phone: string; first: string; zoneId: string; lang: string; vulnerable: string[]; origin: "simulator" | "gateway"; note?: string }) {
  const z = ZONE_BY_ID[o.zoneId];
  const digits = o.phone.replace(/\D/g, "");
  const hash = await hashPassword(randomBytes(18).toString("base64url"));
  const rows = await q<{ id: number }>(
    `INSERT INTO users (first_name, surname, phone, email, password_hash, role, home_address, home_lat, home_lng, home_zone, language, emergency_name, emergency_phone, medical, vulnerable, demo, channel)
     VALUES ($1,'',$2,$3,$4,'user',$5,$6,$7,$8,$9,'Not given','',$10,$11,$12,'ussd')
     ON CONFLICT (phone) DO UPDATE SET first_name = users.first_name RETURNING id`,
    [o.first, o.phone, `ussd-${digits}@phone.stormshield.local`, hash, `${z.name} (area chosen on USSD)`, z.c[0], z.c[1], z.id, o.lang, o.note ?? null, o.vulnerable.join(","), o.origin === "simulator"],
  );
  return (await one<UserRow>(`SELECT * FROM users WHERE id = $1`, [rows[0].id]))!;
}

// ---- Session log ----

export interface Step {
  at: string;
  in: string | null;
  out: string;
  end: boolean;
  screen: string;
}

export interface SessionRow {
  id: number;
  event_id: number;
  channel: "ussd" | "ivr";
  session_id: string;
  phone: string;
  user_id: number | null;
  target_id: number | null;
  steps: string;
  state: string | null;
  outcome: string | null;
  outcome_label: string | null;
  detail: string;
  final_text: string | null;
  ticket_id: number | null;
  report_id: number | null;
  ended_at: string | null;
  lang: string;
}

export async function getSession(sessionId: string) {
  return one<SessionRow>(`SELECT * FROM phone_sessions WHERE session_id = $1`, [sessionId]);
}

export async function openSession(o: { eventId: number; channel: "ussd" | "ivr"; sessionId: string; phone: string; userId: number | null; targetId?: number | null; serviceCode?: string | null; network?: string | null; origin: string; lang: string; zoneId: string | null }) {
  await q(
    `INSERT INTO phone_sessions (event_id, channel, session_id, phone, user_id, target_id, service_code, network, origin, lang, zone_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (session_id) DO NOTHING`,
    [o.eventId, o.channel, o.sessionId, o.phone, o.userId, o.targetId ?? null, o.serviceCode ?? null, o.network ?? null, o.origin, o.lang, o.zoneId],
  );
  return (await getSession(o.sessionId))!;
}

export async function logStep(
  s: SessionRow,
  step: Omit<Step, "at">,
  patch: { state?: string; detail?: Record<string, unknown>; outcome?: string; outcomeLabel?: string; ticketId?: number | null; reportId?: number | null; userId?: number | null; lang?: string; zoneId?: string | null } = {},
) {
  const steps = JSON.parse(s.steps || "[]") as Step[];
  steps.push({ at: new Date().toISOString(), ...step });
  s.steps = JSON.stringify(steps);
  await q(
    `UPDATE phone_sessions SET steps = $2, state = coalesce($3, state), detail = coalesce($4, detail), outcome = coalesce($5, outcome), outcome_label = coalesce($6, outcome_label),
       ticket_id = coalesce($7, ticket_id), report_id = coalesce($8, report_id), user_id = coalesce($9, user_id), lang = coalesce($10, lang), zone_id = coalesce($11, zone_id),
       final_text = CASE WHEN $12 THEN $13 ELSE final_text END, ended_at = CASE WHEN $12 THEN now() ELSE ended_at END, updated_at = now()
     WHERE id = $1`,
    [s.id, s.steps, patch.state ?? null, patch.detail ? JSON.stringify(patch.detail) : null, patch.outcome ?? null, patch.outcomeLabel ?? null, patch.ticketId ?? null, patch.reportId ?? null, patch.userId ?? null, patch.lang ?? null, patch.zoneId ?? null, step.end, step.end ? step.out : null],
  );
}
