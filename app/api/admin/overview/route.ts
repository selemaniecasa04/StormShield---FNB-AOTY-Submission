import { q } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { getSnapshot, eventHour } from "@/lib/status";
import { ticketRef } from "@/lib/users";
import { needHelpProbability, estimateAffected, shelterPlan } from "@/lib/insights";
import { rank, type Level } from "@/lib/risk";
import { ZONE_BY_ID, zoneAt } from "@/lib/geo";
import { loadUnits, outreachData } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  const { snap, event } = await getSnapshot();
  const zs = Object.fromEntries(snap.zones.map((z) => [z.id, z]));

  const users = await q<{
    id: number; first_name: string; surname: string; phone: string; home_zone: string | null; home_lat: number; home_lng: number;
    gps_lat: number | null; gps_lng: number | null; gps_at: string | null; vulnerable: string; language: string; medical: string | null; home_address: string;
    status: string | null; status_at: string | null; emergency_name: string; emergency_phone: string;
  }>(
    `SELECT u.id, u.first_name, u.surname, u.phone, u.home_zone, u.home_lat, u.home_lng, u.gps_lat, u.gps_lng, u.gps_at, u.vulnerable, u.language, u.medical,
            u.home_address, u.emergency_name, u.emergency_phone, c.status, c.created_at AS status_at
     FROM users u
     LEFT JOIN LATERAL (SELECT status, created_at FROM checkins WHERE user_id = u.id AND event_id = $1 ORDER BY created_at DESC LIMIT 1) c ON true
     WHERE u.role = 'user' ORDER BY u.id`,
    [event.id],
  );
  const lastAlert = await q<{ zone_id: string; at: string }>(`SELECT zone_id, max(created_at) AS at FROM alerts WHERE event_id = $1 AND zone_id IS NOT NULL GROUP BY zone_id`, [event.id]);
  const alertAt = Object.fromEntries(lastAlert.map((a) => [a.zone_id, a.at]));

  const residents = users.map((u) => {
    const useGps = u.gps_lat != null && u.gps_lng != null && u.gps_at && Date.now() - new Date(u.gps_at).getTime() < 12 * 3_600_000;
    const p: [number, number] = useGps ? [u.gps_lat!, u.gps_lng!] : [u.home_lat, u.home_lng];
    const zoneId = useGps ? zoneAt(p)?.id ?? u.home_zone : u.home_zone;
    const z = zoneId ? zs[zoneId] : null;
    const vul = u.vulnerable ? u.vulnerable.split(",").filter(Boolean) : [];
    const since = zoneId && alertAt[zoneId] ? (Date.now() - new Date(alertAt[zoneId]).getTime()) / 60000 : null;
    return {
      id: u.id,
      name: `${u.first_name} ${u.surname}`,
      phone: u.phone,
      address: u.home_address,
      language: u.language,
      p,
      zoneId,
      zoneName: zoneId ? ZONE_BY_ID[zoneId]?.name ?? null : null,
      level: (z?.level ?? null) as Level | null,
      vulnerable: vul,
      medical: !!u.medical,
      status: u.status,
      statusAt: u.status_at,
      emergency: `${u.emergency_name} · ${u.emergency_phone}`,
      risk: needHelpProbability({ level: z?.level ?? null, depthM: z?.depthM ?? 0, vulnerable: vul.length, medical: !!u.medical, status: u.status, minutesSilent: since }),
    };
  });

  const tickets = await q<{
    id: number; type: string; note: string | null; people: number; lat: number; lng: number; status: string; team: string | null; created_at: string; updated_at: string;
    unit_id: string | null; eta_at: string | null; priority: string; source: string;
    user_id: number; first_name: string; surname: string; phone: string; vulnerable: string; medical: string | null; home_zone: string | null;
  }>(
    `SELECT t.*, u.first_name, u.surname, u.phone, u.vulnerable, u.medical, u.home_zone FROM tickets t JOIN users u ON u.id = t.user_id
     WHERE t.event_id = $1 ORDER BY (t.status = 'resolved'), (t.status <> 'received'), CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, t.created_at DESC`,
    [event.id],
  );

  const msgStats = await q<{ channel: string; n: number }>(`SELECT channel, count(*)::int AS n FROM messages WHERE event_id = $1 GROUP BY channel`, [event.id]);
  const alertCount = await q<{ n: number }>(`SELECT count(*)::int AS n FROM alerts WHERE event_id = $1`, [event.id]);
  const activity = await q<{ kind: string; label: string; name: string; zone: string | null; at: string }>(
    `(SELECT 'checkin' AS kind, c.status AS label, u.first_name || ' ' || u.surname AS name, u.home_zone AS zone, c.created_at AS at FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.event_id = $1 ORDER BY c.created_at DESC LIMIT 15)
     UNION ALL
     (SELECT 'ticket', t.type, u.first_name || ' ' || u.surname, u.home_zone, t.created_at FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.event_id = $1 ORDER BY t.created_at DESC LIMIT 10)
     UNION ALL
     (SELECT 'report', r.kind, coalesce(r.note, ''), r.zone_id, r.created_at FROM reports r WHERE r.event_id = $1 ORDER BY r.created_at DESC LIMIT 10)
     ORDER BY at DESC LIMIT 25`,
    [event.id],
  );

  const inDanger = residents.filter((r) => r.level && rank(r.level) >= 2);
  const status = (s: string | null) => residents.filter((r) => r.status === s).length;
  const openTickets = tickets.filter((t) => t.status !== "resolved");
  const zones = snap.zones.map((z) => {
    const rs = residents.filter((r) => r.zoneId === z.id);
    return {
      ...z,
      residents: rs.length,
      safe: rs.filter((r) => r.status === "safe" || r.status === "evacuating").length,
      help: rs.filter((r) => r.status === "need_help").length,
      pending: rs.filter((r) => !r.status).length,
      vulnerable: rs.filter((r) => r.vulnerable.length).length,
      affected: estimateAffected(z),
    };
  });

  const outreach = await outreachData(event.id);
  const units = await loadUnits();
  return json({
    units,
    outreach: { stats: outreach.stats, unreached: outreach.targets.filter((t) => t.status === "unreached"), live: outreach.targets.filter((t) => t.status === "ringing" || t.status === "in_call" || t.status === "queued").slice(0, 12) },
    event: { id: event.id, mode: event.mode, title: event.title, speed: event.speed, hour: event.mode === "drill" ? eventHour(event) : null, startedAt: event.started_at },
    snap,
    kpi: {
      residents: residents.length,
      inRed: residents.filter((r) => r.level === "red").length,
      inOrange: residents.filter((r) => r.level === "orange").length,
      vulnerableInDanger: inDanger.filter((r) => r.vulnerable.length).length,
      safe: status("safe"),
      evacuating: status("evacuating"),
      needHelp: status("need_help"),
      vulnerablePresent: status("vulnerable_present"),
      noResponse: inDanger.filter((r) => !r.status).length,
      openTickets: openTickets.length,
      teamsNeeded: Math.ceil(openTickets.reduce((a, t) => a + (t.people > 3 ? 2 : 1), 0) / 3),
      alerts: alertCount[0]?.n ?? 0,
      messages: Object.fromEntries(msgStats.map((m) => [m.channel, m.n])),
      affected: zones.reduce((a, z) => a + z.affected, 0),
    },
    residents,
    callList: residents
      .filter((r) => r.level && rank(r.level) >= 2 && r.status !== "safe")
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 25),
    tickets: tickets.map((t) => ({
      id: t.id,
      ref: ticketRef(t.id),
      type: t.type,
      note: t.note,
      people: t.people,
      p: [t.lat, t.lng],
      status: t.status,
      team: t.team,
      unitId: t.unit_id,
      etaAt: t.eta_at,
      priority: t.priority,
      source: t.source,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      name: `${t.first_name} ${t.surname}`,
      phone: t.phone,
      vulnerable: t.vulnerable ? t.vulnerable.split(",").filter(Boolean) : [],
      medical: t.medical,
      zoneName: t.home_zone ? ZONE_BY_ID[t.home_zone]?.name ?? null : null,
      level: t.home_zone ? zs[t.home_zone]?.level ?? null : null,
    })),
    zones,
    shelters: shelterPlan(snap),
    activity,
  });
});
