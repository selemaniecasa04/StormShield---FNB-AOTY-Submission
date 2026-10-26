import { q, one } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, handle, json, num, str } from "@/lib/http";
import { audit, getSnapshot } from "@/lib/status";
import { ZONE_BY_ID, zoneAt } from "@/lib/geo";
import { langName } from "@/lib/i18n";
import { insurerName } from "@/lib/insurance";
import { ticketRef } from "@/lib/users";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const { snap, event } = await getSnapshot();
  const level = Object.fromEntries(snap.zones.map((z) => [z.id, z.level]));
  const id = num(url.searchParams.get("id"));

  if (id) {
    const u = await one<Record<string, unknown> & { id: number; home_zone: string | null; work_zone: string | null; language: string; vulnerable: string; insurer_id: string | null }>(
      `SELECT id, first_name, surname, phone, email, home_address, home_zone, home_lat, home_lng, work_address, work_zone, gps_lat, gps_lng, gps_at, language,
              emergency_name, emergency_phone, medical, vulnerable, insurer_id, policy_no, channel, created_at FROM users WHERE id = $1 AND role = 'user'`,
      [id],
    );
    if (!u) return json({ error: "Resident not found." }, 404);
    const [family, checkins, tickets, calls, messages, phoneSessions] = await Promise.all([
      q(`SELECT name, relation, phone, status, status_at FROM family WHERE user_id = $1`, [id]),
      q(`SELECT status, note, created_at FROM checkins WHERE user_id = $1 AND event_id = $2 ORDER BY created_at DESC LIMIT 10`, [id, event.id]),
      q(`SELECT id, type, status, team, priority, source, created_at FROM tickets WHERE user_id = $1 AND event_id = $2 ORDER BY id DESC`, [id, event.id]),
      q(`SELECT a.attempt, a.started_at, a.outcome, a.key, c.title FROM outreach_attempts a JOIN outreach_targets t ON t.id = a.target_id JOIN outreach_campaigns c ON c.id = t.campaign_id
         WHERE t.user_id = $1 AND t.event_id = $2 ORDER BY a.started_at DESC LIMIT 15`, [id, event.id]),
      q(`SELECT channel, to_name, body, created_at FROM messages WHERE user_id = $1 AND event_id = $2 ORDER BY id DESC LIMIT 15`, [id, event.id]),
      q(`SELECT id, channel, outcome_label, started_at, ended_at FROM phone_sessions WHERE user_id = $1 AND event_id = $2 ORDER BY id DESC LIMIT 8`, [id, event.id]),
    ]);
    return json({
      person: {
        ...u,
        homeZoneName: u.home_zone ? ZONE_BY_ID[u.home_zone]?.name : null,
        workZoneName: u.work_zone ? ZONE_BY_ID[u.work_zone]?.name : null,
        level: u.home_zone ? level[u.home_zone] : null,
        languageName: langName(u.language),
        insurer: insurerName(u.insurer_id),
      },
      family,
      checkins,
      tickets: tickets.map((t) => ({ ...t, ref: ticketRef(t.id as number) })),
      calls,
      messages,
      phoneSessions,
    });
  }

  const rows = await q<{
    id: number; first_name: string; surname: string; phone: string; home_zone: string | null; work_zone: string | null; home_lat: number; home_lng: number;
    gps_lat: number | null; gps_lng: number | null; gps_at: string | null; vulnerable: string; medical: string | null; language: string; insurer_id: string | null;
    status: string | null; status_at: string | null; call_status: string | null; call_attempts: number | null; open_ticket: number | null;
  }>(
    `SELECT u.id, u.first_name, u.surname, u.phone, u.home_zone, u.work_zone, u.home_lat, u.home_lng, u.gps_lat, u.gps_lng, u.gps_at, u.vulnerable, u.medical, u.language, u.insurer_id,
            c.status, c.created_at AS status_at, o.status AS call_status, o.attempts AS call_attempts, tk.id AS open_ticket
     FROM users u
     LEFT JOIN LATERAL (SELECT status, created_at FROM checkins WHERE user_id = u.id AND event_id = $1 ORDER BY created_at DESC LIMIT 1) c ON true
     LEFT JOIN LATERAL (SELECT status, attempts FROM outreach_targets WHERE user_id = u.id AND event_id = $1 ORDER BY id DESC LIMIT 1) o ON true
     LEFT JOIN LATERAL (SELECT id FROM tickets WHERE user_id = u.id AND event_id = $1 AND status <> 'resolved' ORDER BY id DESC LIMIT 1) tk ON true
     WHERE u.role = 'user' ORDER BY u.surname, u.first_name`,
    [event.id],
  );
  return json({
    people: rows.map((u) => {
      const recentGps = u.gps_lat != null && u.gps_at && Date.now() - new Date(u.gps_at).getTime() < 12 * 3_600_000;
      const p: [number, number] = recentGps ? [u.gps_lat!, u.gps_lng!] : [u.home_lat, u.home_lng];
      const zoneId = recentGps ? zoneAt(p)?.id ?? u.home_zone : u.home_zone;
      return {
        id: u.id,
        name: `${u.first_name} ${u.surname}`,
        phone: u.phone,
        zone: zoneId ? ZONE_BY_ID[zoneId]?.name ?? null : null,
        level: zoneId ? level[zoneId] ?? null : null,
        p,
        vulnerable: u.vulnerable ? u.vulnerable.split(",") : [],
        medical: !!u.medical,
        language: langName(u.language),
        insured: !!u.insurer_id,
        status: u.status,
        statusAt: u.status_at,
        call: u.call_status ? { status: u.call_status, attempts: u.call_attempts } : null,
        openTicket: u.open_ticket ? ticketRef(u.open_ticket) : null,
      };
    }),
  });
});

/** Send a custom SMS to one resident. */
export const POST = handle(async (req: Request) => {
  const s = await requireAdmin();
  const b = await body(req);
  const userId = num(b.userId);
  const text = str(b.text, 300);
  if (!userId || text.length < 3) return json({ error: "Write a message." }, 400);
  const { event } = await getSnapshot();
  const u = await one<{ first_name: string; surname: string; phone: string }>(`SELECT first_name, surname, phone FROM users WHERE id = $1`, [userId]);
  if (!u) return json({ error: "Resident not found." }, 404);
  await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'sms',$5)`, [event.id, userId, `${u.first_name} ${u.surname}`, u.phone, `StormShield: ${text}`]);
  const me = await one<{ first_name: string; surname: string }>(`SELECT first_name, surname FROM users WHERE id = $1`, [s.uid]);
  await audit(s.uid, `${me?.first_name} ${me?.surname}`, "sms", `SMS to ${u.first_name} ${u.surname}`);
  return json({ ok: true });
});
