import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, limit, num, str } from "@/lib/http";
import { currentEvent } from "@/lib/status";
import { getUser, ticketRef } from "@/lib/users";
import { CHECK_META, type CheckStatus } from "@/lib/risk";

export const POST = handle(async (req: Request) => {
  const s = await requireUser();
  limit(req, "checkin", 30, 60_000);
  const b = await body(req);
  const status = str(b.status, 30) as CheckStatus;
  if (!(status in CHECK_META)) return json({ error: "Unknown status." }, 400);
  const u = await getUser(s.uid);
  const ev = await currentEvent();
  const lat = num(b.lat) ?? u.gps_lat ?? u.home_lat;
  const lng = num(b.lng) ?? u.gps_lng ?? u.home_lng;
  await q(`INSERT INTO checkins (event_id, user_id, status, lat, lng, note) VALUES ($1,$2,$3,$4,$5,$6)`, [ev.id, u.id, status, lat, lng, str(b.note, 300) || null]);

  // Checking in on the app counts as a response: stop any calls in progress.
  await q(
    `UPDATE outreach_targets SET status = 'reached', result = 'app_checkin', updated_at = now() WHERE event_id = $1 AND user_id = $2 AND status IN ('queued','ringing','in_call')`,
    [ev.id, u.id],
  );
  let ticket: string | null = null;
  if (status === "need_help") {
    const open = await one<{ id: number }>(`SELECT id FROM tickets WHERE event_id = $1 AND user_id = $2 AND status <> 'resolved' LIMIT 1`, [ev.id, u.id]);
    if (open) ticket = ticketRef(open.id);
    else {
      const t = await q<{ id: number }>(
        `INSERT INTO tickets (event_id, user_id, type, note, lat, lng, source, priority) VALUES ($1,$2,'assistance',$3,$4,$5,'checkin',$6) RETURNING id`,
        [ev.id, u.id, str(b.note, 300) || "Requested assistance from safety check-in", lat, lng, u.vulnerable ? "high" : "normal"],
      );
      ticket = ticketRef(t[0].id);
      await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'sms',$5)`, [
        ev.id, u.id, u.emergency_name, u.emergency_phone,
        `StormShield: ${u.first_name} ${u.surname} has asked for help during the flood. Responders have been notified (${ticket}). Location: https://maps.google.com/?q=${lat},${lng}`,
      ]);
    }
  }
  return json({ ok: true, ticket });
});
