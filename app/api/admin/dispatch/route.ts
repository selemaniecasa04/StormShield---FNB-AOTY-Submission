import { q, one } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, handle, json, num, str } from "@/lib/http";
import { audit, currentEvent } from "@/lib/status";
import { UNIT_TYPES, etaMinutes, type UnitType } from "@/lib/dispatch";
import { loadUnits } from "@/lib/admin-data";
import { TICKET_TYPES, type TicketType } from "@/lib/risk";
import { ticketRef } from "@/lib/users";
import type { LatLng } from "@/lib/geo";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  return json({ units: await loadUnits() });
});

async function notify(ticketId: number, text: string) {
  const t = await one<{ event_id: number; user_id: number; first_name: string; surname: string; phone: string }>(
    `SELECT t.event_id, t.user_id, u.first_name, u.surname, u.phone FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
    [ticketId],
  );
  if (t) await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'sms',$5)`, [t.event_id, t.user_id, `${t.first_name} ${t.surname}`, t.phone, text]);
}

export const POST = handle(async (req: Request) => {
  const s = await requireAdmin();
  const me = await one<{ first_name: string; surname: string }>(`SELECT first_name, surname FROM users WHERE id = $1`, [s.uid]);
  const actor = `${me?.first_name} ${me?.surname}`;
  const b = await body(req);
  const action = str(b.action, 20);

  if (action === "create") {
    // Staff log a request on someone's behalf (e.g. unreached, or a call to the hotline).
    const userId = num(b.userId);
    const type = str(b.type, 20) as TicketType;
    if (!userId || !(type in TICKET_TYPES)) return json({ error: "Choose a person and a request type." }, 400);
    const u = await one<{ home_lat: number; home_lng: number; gps_lat: number | null; gps_lng: number | null; gps_at: string | null; vulnerable: string }>(`SELECT home_lat, home_lng, gps_lat, gps_lng, gps_at, vulnerable FROM users WHERE id = $1 AND role = 'user'`, [userId]);
    if (!u) return json({ error: "Resident not found." }, 404);
    const recentGps = u.gps_lat != null && u.gps_at && Date.now() - new Date(u.gps_at).getTime() < 12 * 3_600_000;
    const p: LatLng = recentGps ? [u.gps_lat!, u.gps_lng!] : [u.home_lat, u.home_lng];
    const ev = await currentEvent();
    const rows = await q<{ id: number }>(
      `INSERT INTO tickets (event_id, user_id, type, note, lat, lng, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'staff',$8) RETURNING id`,
      [ev.id, userId, type, str(b.note, 300) || "Logged by disaster management", p[0], p[1], str(b.priority, 10) || (u.vulnerable ? "high" : "normal"), s.uid],
    );
    await audit(s.uid, actor, "ticket", `Logged ${TICKET_TYPES[type]} ${ticketRef(rows[0].id)} for resident #${userId}`);
    await notify(rows[0].id, `StormShield: disaster management has logged a ${TICKET_TYPES[type].toLowerCase()} for you (${ticketRef(rows[0].id)}). Help is being arranged.`);
    if (b.targetId) await q(`UPDATE outreach_targets SET ticket_id = $2 WHERE id = $1`, [num(b.targetId), rows[0].id]);
    if (!b.unitId) return json({ ok: true, ticketId: rows[0].id });
    b.ticketId = rows[0].id;
  }

  const ticketId = num(b.ticketId);
  if (!ticketId) return json({ error: "Ticket required." }, 400);
  const t = await one<{ id: number; status: string; lat: number; lng: number; unit_id: string | null }>(`SELECT id, status, lat, lng, unit_id FROM tickets WHERE id = $1`, [ticketId]);
  if (!t) return json({ error: "Ticket not found." }, 404);
  const ref = ticketRef(t.id);

  if (action === "dispatch" || action === "create") {
    const unitId = str(b.unitId, 20);
    const unit = await one<{ id: string; name: string; type: UnitType; base_lat: number; base_lng: number; status: string; phone: string }>(`SELECT * FROM units WHERE id = $1`, [unitId]);
    if (!unit) return json({ error: "Unit not found." }, 404);
    if (unit.status !== "available") return json({ error: `${unit.name} is busy. Choose another unit.` }, 409);
    if (t.status === "resolved") return json({ error: "This request is already resolved." }, 409);
    if (t.unit_id) await q(`UPDATE units SET status = 'available', ticket_id = NULL WHERE id = $1`, [t.unit_id]);
    const eta = etaMinutes([unit.base_lat, unit.base_lng], [t.lat, t.lng], unit.type);
    await q(`UPDATE tickets SET status = 'en_route', unit_id = $2, team = $3, dispatched_at = now(), eta_at = now() + ($4 || ' minutes')::interval, updated_at = now() WHERE id = $1`, [t.id, unit.id, unit.name, String(eta)]);
    await q(`UPDATE units SET status = 'dispatched', ticket_id = $2 WHERE id = $1`, [unit.id, t.id]);
    await notify(t.id, `StormShield: ${unit.name} (${UNIT_TYPES[unit.type].label}) is on the way to you. ETA about ${eta} min. Ref ${ref}. Stay where you are if it is safe.`);
    await q(
      `INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) SELECT event_id, user_id, $2, $3, 'sms', $4 FROM tickets WHERE id = $1`,
      [t.id, unit.name, unit.phone, `DISPATCH ${ref}: ${TICKET_TYPES[(await one<{ type: TicketType }>(`SELECT type FROM tickets WHERE id = $1`, [t.id]))!.type] ?? "Help request"} at https://maps.google.com/?q=${t.lat},${t.lng}`],
    );
    await audit(s.uid, actor, "dispatch", `${unit.name} dispatched to ${ref} (ETA ${eta} min)`);
    return json({ ok: true, eta });
  }

  if (action === "arrive") {
    await q(`UPDATE tickets SET status = 'on_scene', updated_at = now() WHERE id = $1`, [t.id]);
    if (t.unit_id) await q(`UPDATE units SET status = 'on_scene' WHERE id = $1`, [t.unit_id]);
    await notify(t.id, `StormShield: responders are with you now (${ref}).`);
    await audit(s.uid, actor, "on_scene", `${ref} marked on scene`);
    return json({ ok: true });
  }

  if (action === "resolve") {
    await q(`UPDATE tickets SET status = 'resolved', updated_at = now() WHERE id = $1`, [t.id]);
    if (t.unit_id) await q(`UPDATE units SET status = 'available', ticket_id = NULL WHERE id = $1`, [t.unit_id]);
    await notify(t.id, `StormShield: request ${ref} has been closed. If you still need help, press the emergency button again.`);
    await audit(s.uid, actor, "resolve", `${ref} resolved`);
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
});
