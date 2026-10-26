// Automatic alerting: watches zone levels and road closures, raises alerts on escalation,
// and delivers them to every affected resident in their own language (push, SMS, voice).
import { LANGS, alertText } from "./i18n";
import { RIVERS, ROAD_CLOSURES, ZONES, ZONE_BY_ID, type Hazard } from "./geo";
import { rank, levelOf, type Level } from "./risk";
import { drillZoneScore, riverStage, PAST, type Snapshot } from "./engine";
import { createCampaign } from "./outreach";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Exec = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;

interface Deliver {
  eventId: number;
  alertId: number;
  zoneId: string | null;
  level: Level;
  hazard: Hazard;
  eased?: boolean;
  custom?: string | null;
  minutesAgo?: number;
}

export async function deliverAlert(run: Exec, d: Deliver) {
  const area = d.zoneId ? ZONE_BY_ID[d.zoneId]?.name ?? "your area" : "eThekwini";
  const chans = ["push"];
  if (rank(d.level) >= 2 || d.custom) chans.push("sms");
  if (d.level === "red" && !d.eased) chans.push("voice");
  const values = chans.map((c) => `('${c}')`).join(",");
  const ago = `${Math.max(0, Math.round(d.minutesAgo ?? 0))} minutes`;
  for (const l of LANGS) {
    const t = alertText(l.code, d.hazard, d.level, area, { eased: d.eased, custom: d.custom });
    const params: unknown[] = [d.eventId, `${t.title}: ${t.body}`, d.alertId, ago, l.code];
    let where = `u.language = $5 AND u.role = 'user'`;
    if (d.zoneId) {
      params.push(d.zoneId);
      where += ` AND (u.home_zone = $6 OR u.work_zone = $6)`;
    }
    await run(
      `INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body, alert_id, created_at)
       SELECT $1, u.id, u.first_name || ' ' || u.surname, u.phone, c.ch, $2, $3, now() - $4::interval
       FROM users u CROSS JOIN (VALUES ${values}) AS c(ch) WHERE ${where}`,
      params,
    );
  }
}

export async function createAlert(
  run: Exec,
  a: { eventId: number; zoneId: string | null; level: Level; hazard: Hazard; kind: string; custom?: string | null; createdBy?: number | null; minutesAgo?: number },
) {
  const ago = `${Math.max(0, Math.round(a.minutesAgo ?? 0))} minutes`;
  const rows = await run(
    `INSERT INTO alerts (event_id, zone_id, level, hazard, kind, custom, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now() - $8::interval) RETURNING id`,
    [a.eventId, a.zoneId, a.level, a.hazard, a.kind, a.custom ?? null, a.createdBy ?? null, ago],
  );
  const alertId = rows[0].id as number;
  await deliverAlert(run, { eventId: a.eventId, alertId, zoneId: a.zoneId, level: a.level, hazard: a.hazard, eased: a.kind === "eased", custom: a.custom, minutesAgo: a.minutesAgo });
  return alertId;
}

const lastSync = new Map<number, number>();

/** Compare the snapshot with stored state and raise alerts for anything that changed. */
export async function syncAlerts(run: Exec, eventId: number, snap: Snapshot, force = false) {
  if (!snap.ok) return;
  const now = Date.now();
  if (!force && now - (lastSync.get(eventId) ?? 0) < 10_000) return;
  lastSync.set(eventId, now);
  const stored = new Map((await run(`SELECT zone_id, level FROM zone_state WHERE event_id = $1`, [eventId])).map((r) => [r.zone_id as string, r.level as Level]));

  const upsert = async (key: string, level: Level) =>
    run(
      `WITH old AS (SELECT level FROM zone_state WHERE event_id = $1 AND zone_id = $2)
       INSERT INTO zone_state (event_id, zone_id, level) VALUES ($1, $2, $3)
       ON CONFLICT (event_id, zone_id) DO UPDATE SET level = EXCLUDED.level, updated_at = now() WHERE zone_state.level <> EXCLUDED.level
       RETURNING (SELECT level FROM old) AS old_level`,
      [eventId, key, level],
    );

  for (const z of snap.zones) {
    if (stored.get(z.id) === z.level) continue;
    const rows = await upsert(z.id, z.level);
    if (!rows.length) continue; // another instance handled it
    const old = (rows[0].old_level as Level | null) ?? "green";
    if (rank(z.level) > rank(old)) {
      await createAlert(run, { eventId, zoneId: z.id, level: z.level, hazard: z.hazard, kind: "auto" });
      // Call outreach: everyone in a red zone; vulnerable people as soon as a zone turns orange.
      if (z.level === "red") await createCampaign(run, { eventId, title: `Evacuation calls · ${z.name}`, kind: "evacuate", audience: "zone", zoneIds: [z.id], auto: true });
      else if (z.level === "orange") await createCampaign(run, { eventId, title: `Warning calls (vulnerable) · ${z.name}`, kind: "warning", audience: "vulnerable", zoneIds: [z.id], auto: true });
    } else if (rank(old) >= 2 && rank(z.level) < rank(old)) {
      await createAlert(run, { eventId, zoneId: z.id, level: z.level, hazard: z.hazard, kind: "eased" });
    }
  }

  // Road closures follow river stage (or zone score for urban underpasses).
  for (const rc of ROAD_CLOSURES) {
    const stage = rc.river ? snap.rivers[rc.river]?.[PAST] ?? 0 : (snap.zones.find((z) => z.id === rc.zone)?.score ?? 0) / 100;
    const closed = stage >= rc.threshold;
    const key = `rc:${rc.id}`;
    const level: Level = closed ? "orange" : "green";
    if ((stored.get(key) ?? "green") === level) continue;
    const rows = await upsert(key, level);
    if (rows.length && closed) {
      await createAlert(run, { eventId, zoneId: rc.zone, level: "orange", hazard: "road", kind: "auto", custom: `${rc.name} is closed by flood water. Use another route.` });
    }
  }
}

/** Seed: replay the drill from its start so the timeline has realistic history. */
export async function seedAlertHistory(run: Exec, eventId: number, hour: number) {
  const events: { h: number; fn: () => Promise<unknown> }[] = [];
  for (const z of ZONES) {
    let lvl: Level = "green";
    for (let h = -3; h <= hour + 1e-9; h += 0.25) {
      const l = levelOf(drillZoneScore(z, h));
      if (rank(l) > rank(lvl)) {
        const at = h;
        const level = l;
        events.push({ h: at, fn: () => createAlert(run, { eventId, zoneId: z.id, level, hazard: z.hazard, kind: "auto", minutesAgo: (hour - at) * 60 }) });
      }
      lvl = l;
    }
    await run(`INSERT INTO zone_state (event_id, zone_id, level) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [eventId, z.id, levelOf(drillZoneScore(z, hour))]);
  }
  for (const rc of ROAD_CLOSURES) {
    if (!rc.river) continue;
    const r = RIVERS.find((x) => x.id === rc.river)!;
    let closedAt: number | null = null;
    for (let h = -3; h <= hour; h += 0.25) {
      if (riverStage(r.id, h) >= rc.threshold) {
        closedAt = h;
        break;
      }
    }
    if (closedAt !== null) {
      const at = closedAt;
      events.push({ h: at, fn: () => createAlert(run, { eventId, zoneId: rc.zone, level: "orange", hazard: "road", kind: "auto", custom: `${rc.name} is closed by flood water. Use another route.`, minutesAgo: (hour - at) * 60 }) });
      await run(`INSERT INTO zone_state (event_id, zone_id, level) VALUES ($1,$2,'orange') ON CONFLICT DO NOTHING`, [eventId, `rc:${rc.id}`]);
    }
  }
  events.sort((a, b) => a.h - b.h);
  for (const e of events) await e.fn();
}
