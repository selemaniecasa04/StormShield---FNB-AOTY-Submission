import "server-only";
import { q, one } from "./db";
import { drillSnapshot, type Snapshot } from "./engine";
import { liveSnapshot, peekActual } from "./live";
import { syncAlerts } from "./alerts";
import { processOutreach } from "./outreach";
import { floodedPlaces } from "@/components/map/model";

/** Which shelters are cut off by flood water right now. */
export function floodedFn(snap: Snapshot) {
  const f = floodedPlaces(snap, 0);
  return (id: string) => !!f[id];
}

export async function audit(uid: number, actor: string, action: string, detail: string) {
  await q(`INSERT INTO audit (user_id, actor, action, detail) VALUES ($1,$2,$3,$4)`, [uid, actor, action, detail]);
}

export interface EventRow {
  id: number;
  mode: "drill" | "live";
  title: string;
  anchor_hour: number;
  anchor_at: string;
  speed: number;
  started_at: string;
}

export async function currentEvent(): Promise<EventRow> {
  const ev = await one<EventRow>(`SELECT * FROM events WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1`);
  if (ev) return ev;
  const rows = await q<EventRow>(`INSERT INTO events (mode, title) VALUES ('live', 'Live monitoring') RETURNING *`);
  return rows[0];
}

export function eventHour(ev: EventRow) {
  const elapsedH = (Date.now() - new Date(ev.anchor_at).getTime()) / 3_600_000;
  return Math.min(30, ev.anchor_hour + elapsedH * ev.speed);
}

export async function reportCounts(eventId: number) {
  const rows = await q<{ zone_id: string; n: number }>(
    `SELECT zone_id, count(*)::int AS n FROM reports WHERE event_id = $1 AND status <> 'dismissed' AND created_at > now() - interval '3 hours' AND zone_id IS NOT NULL GROUP BY zone_id`,
    [eventId],
  );
  return Object.fromEntries(rows.map((r) => [r.zone_id, r.n])) as Record<string, number>;
}

export async function getSnapshot(): Promise<{ snap: Snapshot; event: EventRow }> {
  const event = await currentEvent();
  const reports = await reportCounts(event.id);
  let snap: Snapshot;
  if (event.mode === "drill") {
    snap = drillSnapshot(eventHour(event), reports, event.title);
    snap.weather.actual = peekActual();
  } else {
    snap = await liveSnapshot(reports);
  }
  await syncAlerts(q, event.id, snap);
  await processOutreach(q, event.id, floodedFn(snap));
  return { snap, event };
}
