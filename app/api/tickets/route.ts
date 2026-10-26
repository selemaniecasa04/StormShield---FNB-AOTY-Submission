import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, limit, num, str } from "@/lib/http";
import { currentEvent } from "@/lib/status";
import { getUser, ticketRef } from "@/lib/users";
import { TICKET_TYPES, type TicketType } from "@/lib/risk";

export const POST = handle(async (req: Request) => {
  const s = await requireUser();
  limit(req, "panic", 6, 60_000);
  const b = await body(req);
  const type = str(b.type, 20) as TicketType;
  if (!(type in TICKET_TYPES)) return json({ error: "Choose what kind of help you need." }, 400);
  const u = await getUser(s.uid);
  const ev = await currentEvent();
  const lat = num(b.lat) ?? u.gps_lat ?? u.home_lat;
  const lng = num(b.lng) ?? u.gps_lng ?? u.home_lng;
  const people = Math.max(1, Math.min(50, Math.round(num(b.people) ?? 1)));
  const note = str(b.note, 500) || null;
  const accuracy = num(b.accuracy);
  const rows = await q<{ id: number; created_at: string }>(
    `INSERT INTO tickets (event_id, user_id, type, note, people, lat, lng, source, priority) VALUES ($1,$2,$3,$4,$5,$6,$7,'panic',$8) RETURNING id, created_at`,
    [ev.id, u.id, type, note, people, lat, lng, type === "rescue" || type === "medical" ? "urgent" : u.vulnerable ? "high" : "normal"],
  );
  const ref = ticketRef(rows[0].id);
  await q(`INSERT INTO checkins (event_id, user_id, status, lat, lng, note) VALUES ($1,$2,'need_help',$3,$4,$5)`, [ev.id, u.id, lat, lng, `Panic: ${TICKET_TYPES[type]}`]);
  await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'sms',$5), ($1,$2,$6,$7,'push',$8)`, [
    ev.id, u.id, u.emergency_name, u.emergency_phone,
    `StormShield EMERGENCY: ${u.first_name} ${u.surname} pressed the panic button (${TICKET_TYPES[type]}). Ticket ${ref}. Location: https://maps.google.com/?q=${lat},${lng}`,
    `${u.first_name} ${u.surname}`, u.phone,
    `Your emergency ticket ${ref} was received. Stay where you are if it is safe. Responders can see your location.`,
  ]);
  // Other people marked as emergency contacts in the family circle are told too.
  await q(
    `INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body)
     SELECT $1, $2, f.name, f.phone, 'sms', $3 FROM family f WHERE f.user_id = $2 AND f.is_contact AND f.phone <> $4`,
    [ev.id, u.id, `StormShield EMERGENCY: ${u.first_name} ${u.surname} needs help (${TICKET_TYPES[type]}). Ticket ${ref}. Location: https://maps.google.com/?q=${lat},${lng}`, u.emergency_phone],
  );
  return json({
    ok: true,
    ticket: { ref, id: rows[0].id, createdAt: rows[0].created_at, lat, lng, accuracy, type, people },
  });
});
