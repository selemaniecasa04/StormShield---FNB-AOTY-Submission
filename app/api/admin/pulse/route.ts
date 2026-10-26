import { q } from "@/lib/db";
import { getSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { getSnapshot } from "@/lib/status";
import { TICKET_TYPES, type TicketType } from "@/lib/risk";
import { ticketRef } from "@/lib/users";
import { claimRef } from "@/lib/insurance";

export const dynamic = "force-dynamic";

/** Small, frequent poll for staff: what happened since `since` (drives pop-up notifications). */
export const GET = handle(async (req: Request) => {
  const s = await getSession();
  if (!s || s.role === "user") throw new HttpError(403, "Staff only.");
  const since = new URL(req.url).searchParams.get("since") || new Date(Date.now() - 15_000).toISOString();
  const { event } = await getSnapshot();
  const items: { id: string; tone: "danger" | "warn" | "info" | "ok"; title: string; body: string; at: string }[] = [];
  if (s.role === "admin") {
    const t = await q<{ id: number; type: string; priority: string; source: string; created_at: string; name: string }>(
      `SELECT t.id, t.type, t.priority, t.source, t.created_at, u.first_name || ' ' || u.surname AS name FROM tickets t JOIN users u ON u.id = t.user_id
       WHERE t.event_id = $1 AND t.created_at > $2 ORDER BY t.id`,
      [event.id, since],
    );
    for (const x of t) items.push({ id: `t${x.id}`, tone: x.priority === "urgent" ? "danger" : "warn", title: `New help request ${ticketRef(x.id)}`, body: `${x.name}: ${TICKET_TYPES[x.type as TicketType] ?? x.type}`, at: x.created_at });
    const u = await q<{ id: number; name: string; updated_at: string }>(
      `SELECT t.id, u.first_name || ' ' || u.surname AS name, t.updated_at FROM outreach_targets t JOIN users u ON u.id = t.user_id WHERE t.event_id = $1 AND t.status = 'unreached' AND t.updated_at > $2`,
      [event.id, since],
    );
    for (const x of u) items.push({ id: `u${x.id}`, tone: "warn", title: "Unreached after 3 calls", body: `${x.name}: family notified, added to the unreached queue`, at: x.updated_at });
    const sos = await q<{ id: number; name: string; updated_at: string; key: string }>(
      `SELECT t.id, u.first_name || ' ' || u.surname AS name, t.updated_at, t.key FROM outreach_targets t JOIN users u ON u.id = t.user_id WHERE t.event_id = $1 AND t.key IN ('3','4') AND t.updated_at > $2`,
      [event.id, since],
    );
    const ph = await q<{ id: number; outcome: string; outcome_label: string; channel: string; ended_at: string; name: string | null; phone: string }>(
      `SELECT s.id, s.outcome, s.outcome_label, s.channel, s.ended_at, u.first_name || ' ' || u.surname AS name, s.phone FROM phone_sessions s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.event_id = $1 AND s.ended_at > $2 AND s.outcome IN ('safe','evacuating','help','report','registered','callback') ORDER BY s.id`,
      [event.id, since],
    );
    for (const x of ph) items.push({ id: `p${x.id}`, tone: x.outcome === "help" ? "danger" : x.outcome === "callback" ? "warn" : x.outcome === "safe" || x.outcome === "evacuating" ? "ok" : "info", title: `Feature phone (${x.channel === "ussd" ? "USSD" : "voice"})`, body: `${x.name?.trim() || x.phone}: ${x.outcome_label}`, at: x.ended_at });
    for (const x of sos) items.push({ id: `k${x.id}`, tone: x.key === "4" ? "danger" : "warn", title: `Keypad ${x.key} pressed`, body: `${x.name}: ${x.key === "4" ? "in danger now" : "needs help to evacuate"}`, at: x.updated_at });
  } else {
    const c = await q<{ id: number; name: string; created_at: string; validation: string }>(
      `SELECT c.id, u.first_name || ' ' || u.surname AS name, c.created_at, c.validation FROM claims c JOIN users u ON u.id = c.user_id WHERE c.created_at > $1 ORDER BY c.id`,
      [since],
    );
    for (const x of c) items.push({ id: `c${x.id}`, tone: x.validation === "consistent" ? "info" : "warn", title: `New claim ${claimRef(x.id)}`, body: `${x.name} · ${x.validation === "consistent" ? "matches flood data" : "needs review"}`, at: x.created_at });
  }
  return json({ items, now: new Date().toISOString() });
});
