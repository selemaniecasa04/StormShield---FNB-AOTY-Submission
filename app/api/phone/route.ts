import { q } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { body, handle, json, limit, normPhone, str } from "@/lib/http";
import { floodedFn, getSnapshot } from "@/lib/status";
import { simulatorMayUse, userByPhone } from "@/lib/phone";
import { createCampaign, targetScript } from "@/lib/outreach";
import { menu, type OutreachKind } from "@/lib/outreach-text";
import { insurerName } from "@/lib/insurance";
import { ivrAction } from "@/lib/ivr";
import { ZONE_BY_ID } from "@/lib/geo";
import { categoryOf, TICKET_STATUS_LABEL, TICKET_TYPES, type TicketStatus, type TicketType } from "@/lib/risk";
import { langName } from "@/lib/i18n";
import { ticketRef } from "@/lib/ids";
import { withEmergencyFooter } from "@/lib/emergency";
import type { UserRow } from "@/lib/users";

export const dynamic = "force-dynamic";

async function subscriber(msisdn: unknown) {
  const phone = normPhone(msisdn);
  if (!phone) throw new HttpError(400, "Enter a valid phone number.");
  const u = await userByPhone(phone);
  if (!simulatorMayUse(phone, u)) throw new HttpError(403, "The demo phone can only use demo numbers.");
  return { phone, u };
}

async function activeCall(u: UserRow, eventId: number) {
  const rows = await q<{ id: number; status: string; attempts: number; ring_at: string | null; kind: OutreachKind; message: string | null; c_insurer: string | null; title: string }>(
    `SELECT t.id, t.status, t.attempts, t.ring_at, c.kind, c.message, c.insurer_id AS c_insurer, c.title FROM outreach_targets t JOIN outreach_campaigns c ON c.id = t.campaign_id
     WHERE t.event_id = $1 AND t.user_id = $2 AND t.status IN ('ringing','in_call') ORDER BY t.id DESC LIMIT 1`,
    [eventId, u.id],
  );
  const c = rows[0];
  if (!c) return null;
  return {
    id: c.id, status: c.status, attempt: c.attempts, ringAt: c.ring_at, kind: c.kind, title: c.title, insurer: insurerName(c.c_insurer),
    script: targetScript({ language: u.language, kind: c.kind, home_zone: u.home_zone, message: c.message, c_insurer: c.c_insurer }),
    menu: menu(u.language, !!u.insurer_id && u.insurer_consent),
  };
}

export const GET = handle(async (req: Request) => {
  const { phone, u } = await subscriber(new URL(req.url).searchParams.get("msisdn"));
  const { snap, event } = await getSnapshot();
  const zone = u?.home_zone ? snap.zones.find((z) => z.id === u.home_zone) : null;
  const [inbox, voice, sessions, tickets, watchers, queued] = await Promise.all([
    q<{ id: number; body: string; created_at: string }>(`SELECT id, body, created_at FROM messages WHERE to_phone = $1 AND channel = 'sms' AND event_id = $2 ORDER BY id DESC LIMIT 25`, [phone, event.id]),
    q<{ id: number; body: string; created_at: string }>(`SELECT id, body, created_at FROM messages WHERE to_phone = $1 AND channel = 'voice' AND event_id = $2 ORDER BY id DESC LIMIT 10`, [phone, event.id]),
    q<{ id: number; channel: string; started_at: string; ended_at: string | null; updated_at: string; outcome: string | null; outcome_label: string | null; steps: string; ticket_id: number | null; state: string | null }>(
      `SELECT id, channel, started_at, ended_at, updated_at, outcome, outcome_label, steps, ticket_id, state FROM phone_sessions WHERE phone = $1 ORDER BY id DESC LIMIT 6`, [phone]),
    u ? q<{ id: number; type: string; status: string; priority: string; people: number; team: string | null; eta_at: string | null; source: string; created_at: string }>(
      `SELECT id, type, status, priority, people, team, eta_at, source, created_at FROM tickets WHERE event_id = $1 AND user_id = $2 ORDER BY id DESC LIMIT 4`, [event.id, u.id]) : Promise.resolve([]),
    u ? q<{ name: string }>(`SELECT o.first_name || ' ' || o.surname AS name FROM family f JOIN users o ON o.id = f.user_id WHERE (f.linked_user_id = $1 OR f.phone = $2) AND f.user_id <> $1`, [u.id, phone]) : Promise.resolve([]),
    u ? q<{ next_at: string; attempts: number }>(`SELECT next_at, attempts FROM outreach_targets WHERE event_id = $1 AND user_id = $2 AND status = 'queued' ORDER BY next_at LIMIT 1`, [event.id, u.id]) : Promise.resolve([]),
  ]);
  const checkin = u ? (await q<{ status: string; note: string | null; created_at: string }>(`SELECT status, note, created_at FROM checkins WHERE event_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`, [event.id, u.id]))[0] ?? null : null;
  return json({
    phone,
    now: new Date().toISOString(),
    subscriber: u
      ? {
          name: `${u.first_name}${u.surname ? ` ${u.surname}` : ""}`, firstName: u.first_name, channel: u.channel, language: langName(u.language), langCode: u.language,
          area: u.home_zone ? ZONE_BY_ID[u.home_zone]?.name ?? null : null, address: u.home_address, vulnerable: u.vulnerable,
          level: zone?.level ?? null, score: zone?.score ?? null, category: zone ? categoryOf(zone.score) : null, watchers: watchers.map((w) => w.name), checkin,
        }
      : null,
    call: u ? await activeCall(u, event.id) : null,
    nextCallAt: queued[0]?.next_at ?? null,
    inbox: inbox.map((m) => ({ id: m.id, at: m.created_at, body: withEmergencyFooter(m.body) })),
    voice: voice.map((m) => ({ id: m.id, at: m.created_at, body: m.body })),
    tickets: tickets.map((t) => ({ ref: ticketRef(t.id), type: TICKET_TYPES[t.type as TicketType] ?? t.type, status: TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status, rawStatus: t.status, priority: t.priority, people: t.people, team: t.team, etaAt: t.eta_at, source: t.source, at: t.created_at })),
    sessions: sessions.map((s) => ({
      id: s.id, channel: s.channel, startedAt: s.started_at, endedAt: s.ended_at, updatedAt: s.updated_at, outcome: s.outcome, label: s.outcome_label, ticket: s.ticket_id ? ticketRef(s.ticket_id) : null,
      steps: (JSON.parse(s.steps || "[]") as { at: string; in: string | null; out: string; end: boolean }[]).slice(-12),
    })),
  });
});

export const POST = handle(async (req: Request) => {
  limit(req, "phone", 90, 60_000);
  const b = await body(req);
  const { u } = await subscriber(b.msisdn);
  if (!u) return json({ error: "This number is not registered yet. Dial *120*7867# to register." }, 400);
  const action = str(b.action, 12);
  const { snap, event } = await getSnapshot();

  if (action === "call_me") {
    limit(req, "phone-call", 6, 60_000);
    const zone = u.home_zone ? snap.zones.find((z) => z.id === u.home_zone) : null;
    const kind: OutreachKind = zone?.level === "red" ? "evacuate" : "warning";
    const r = await createCampaign(q, { eventId: event.id, title: `Test call · ${u.first_name} ${u.surname} (feature phone)`, kind, audience: "single", userIds: [u.id], delaySec: 3 });
    if (!r.count) return json({ error: "A call to this phone is already in progress." }, 409);
    return json({ ok: true, inSec: 3 });
  }

  if (!["answer", "decline", "key", "answer_q", "hangup"].includes(action)) return json({ error: "Unknown action." }, 400);
  const targetId = Number(b.targetId);
  if (!Number.isInteger(targetId)) return json({ error: "Missing call." }, 400);
  const call = await activeCall(u, event.id);
  const r = await ivrAction({ u, targetId, action: action as "answer", key: str(b.key, 2), script: call?.id === targetId ? call.script : undefined, flooded: floodedFn(snap) });
  if ("error" in r) return json({ error: r.error }, r.status);
  return json(r);
});
