import { q } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { getSnapshot } from "@/lib/status";
import { ZONE_BY_ID } from "@/lib/geo";
import { TICKET_STATUS_LABEL, TICKET_TYPES, categoryOf, type TicketStatus, type TicketType } from "@/lib/risk";
import { langName } from "@/lib/i18n";
import { ticketRef } from "@/lib/ids";
import { screenLabel } from "@/lib/ussd";

export const dynamic = "force-dynamic";

/** Everything received from basic phones: USSD sessions and voice-call keypad answers, with full transcripts. */
export const GET = handle(async () => {
  await requireAdmin();
  const { snap, event } = await getSnapshot();
  const rows = await q<{
    id: number; channel: string; session_id: string; phone: string; user_id: number | null; service_code: string | null; network: string | null; origin: string; lang: string;
    steps: string; state: string | null; outcome: string | null; outcome_label: string | null; detail: string; ticket_id: number | null; report_id: number | null; zone_id: string | null;
    started_at: string; updated_at: string; ended_at: string | null; age: number;
    first_name: string | null; surname: string | null; home_address: string | null; home_zone: string | null; vulnerable: string | null; medical: string | null; language: string | null;
    emergency_name: string | null; emergency_phone: string | null; u_channel: string | null; home_lat: number | null; home_lng: number | null;
    t_status: string | null; t_type: string | null; t_priority: string | null; t_people: number | null; t_team: string | null; t_lat: number | null; t_lng: number | null; t_note: string | null; t_unit: string | null;
  }>(
    `SELECT s.*, EXTRACT(EPOCH FROM (now() - s.updated_at))::float AS age,
       u.first_name, u.surname, u.home_address, u.home_zone, u.vulnerable, u.medical, u.language, u.emergency_name, u.emergency_phone, u.channel AS u_channel, u.home_lat, u.home_lng,
       t.status AS t_status, t.type AS t_type, t.priority AS t_priority, t.people AS t_people, t.team AS t_team, t.lat AS t_lat, t.lng AS t_lng, t.note AS t_note, t.unit_id AS t_unit
     FROM phone_sessions s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN tickets t ON t.id = s.ticket_id
     WHERE s.event_id = $1 ORDER BY s.updated_at DESC LIMIT 150`,
    [event.id],
  );
  const family = rows.length
    ? await q<{ linked: number; name: string }>(
        `SELECT f.linked_user_id AS linked, o.first_name || ' ' || o.surname AS name FROM family f JOIN users o ON o.id = f.user_id WHERE f.linked_user_id = ANY($1::int[])`,
        [[...new Set(rows.map((r) => r.user_id).filter(Boolean))]],
      )
    : [];
  const sessions = rows.map((r) => {
    const steps = JSON.parse(r.steps || "[]") as { at: string; in: string | null; out: string; end: boolean; screen: string }[];
    const live = !r.ended_at && r.age < 90;
    const z = r.home_zone ? snap.zones.find((x) => x.id === r.home_zone) : null;
    return {
      id: r.id,
      channel: r.channel,
      sessionId: r.session_id,
      phone: r.phone,
      serviceCode: r.service_code,
      network: r.network,
      origin: r.origin,
      lang: langName(r.lang),
      status: r.ended_at ? "complete" : live ? "live" : "timed_out",
      outcome: r.outcome ?? (r.ended_at ? null : live ? "in_progress" : "abandoned"),
      label: r.outcome_label ?? (live ? `In progress: ${screenLabel(r.state ?? "")}` : r.ended_at ? "Ended" : `Dropped at "${screenLabel(r.state ?? "")}"`),
      detail: JSON.parse(r.detail || "{}"),
      startedAt: r.started_at,
      updatedAt: r.updated_at,
      endedAt: r.ended_at,
      durationSec: Math.round(((r.ended_at ? new Date(r.ended_at).getTime() : new Date(r.updated_at).getTime()) - new Date(r.started_at).getTime()) / 1000),
      steps: steps.map((s) => ({ ...s, screenLabel: screenLabel(s.screen) })),
      person: r.user_id
        ? {
            id: r.user_id, name: `${r.first_name}${r.surname ? ` ${r.surname}` : ""}`, address: r.home_address, area: r.home_zone ? ZONE_BY_ID[r.home_zone]?.name : null,
            level: z?.level ?? null, category: z ? categoryOf(z.score) : null, vulnerable: r.vulnerable, medical: r.medical, language: langName(r.language ?? "en"),
            emergency: r.emergency_phone ? `${r.emergency_name} ${r.emergency_phone}` : null, channel: r.u_channel, home: [r.home_lat, r.home_lng],
            family: family.filter((f) => f.linked === r.user_id).map((f) => f.name),
          }
        : null,
      ticket: r.ticket_id
        ? { id: r.ticket_id, ref: ticketRef(r.ticket_id), status: r.t_status, statusLabel: TICKET_STATUS_LABEL[r.t_status as TicketStatus] ?? r.t_status, type: r.t_type, typeLabel: TICKET_TYPES[r.t_type as TicketType] ?? r.t_type, priority: r.t_priority, people: r.t_people, team: r.t_team, p: [r.t_lat, r.t_lng], note: r.t_note, unit: r.t_unit }
        : null,
      reportId: r.report_id,
    };
  });
  const users = await q<{ id: number; first_name: string; surname: string; phone: string; home_zone: string | null; language: string; vulnerable: string; created_at: string; last: string | null; status: string | null }>(
    `SELECT u.id, u.first_name, u.surname, u.phone, u.home_zone, u.language, u.vulnerable, u.created_at,
       (SELECT max(updated_at) FROM phone_sessions s WHERE s.user_id = u.id) AS last,
       (SELECT status FROM checkins c WHERE c.user_id = u.id AND c.event_id = $1 ORDER BY created_at DESC LIMIT 1) AS status
     FROM users u WHERE u.role = 'user' AND u.channel = 'ussd' ORDER BY u.id DESC LIMIT 50`,
    [event.id],
  );
  const count = (f: (s: (typeof sessions)[number]) => boolean) => sessions.filter(f).length;
  return json({
    kpi: {
      sessions: sessions.length,
      numbers: new Set(sessions.map((s) => s.phone)).size,
      live: count((s) => s.status === "live"),
      safe: count((s) => s.outcome === "safe" || s.outcome === "evacuating" || s.outcome === "call_key_1" || s.outcome === "call_key_2"),
      help: count((s) => s.outcome === "help" || s.outcome === "callback" || s.outcome === "call_key_3" || s.outcome === "call_key_4"),
      reports: count((s) => s.outcome === "report"),
      registered: count((s) => s.outcome === "registered"),
      dropped: count((s) => s.status === "timed_out"),
      avgSec: sessions.length ? Math.round(sessions.reduce((a, s) => a + s.durationSec, 0) / sessions.length) : 0,
    },
    sessions,
    users: users.map((u) => ({ id: u.id, name: `${u.first_name}${u.surname ? ` ${u.surname}` : ""}`, phone: u.phone, area: u.home_zone ? ZONE_BY_ID[u.home_zone]?.name : null, language: langName(u.language), vulnerable: u.vulnerable, createdAt: u.created_at, last: u.last, status: u.status })),
  });
});
