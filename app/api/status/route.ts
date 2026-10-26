import { q } from "@/lib/db";
import { getSnapshot, eventHour } from "@/lib/status";
import { handle, json } from "@/lib/http";
import { alertText } from "@/lib/i18n";
import { ZONE_BY_ID, type Hazard } from "@/lib/geo";
import type { Level } from "@/lib/risk";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const { snap, event } = await getSnapshot();
  const alerts = await q<{ id: number; zone_id: string | null; level: Level; hazard: Hazard; kind: string; custom: string | null; created_at: string }>(
    `SELECT id, zone_id, level, hazard, kind, custom, created_at FROM alerts WHERE event_id = $1 ORDER BY created_at DESC, id DESC LIMIT 40`,
    [event.id],
  );
  const reports = await q(
    `SELECT id, kind, note, lat, lng, zone_id, created_at FROM reports WHERE event_id = $1 AND created_at > now() - interval '12 hours' ORDER BY created_at DESC LIMIT 60`,
    [event.id],
  );
  return json({
    snap,
    event: { id: event.id, mode: event.mode, title: event.title, speed: event.speed, hour: event.mode === "drill" ? eventHour(event) : null, startedAt: event.started_at },
    alerts: alerts.map((a) => {
      const area = a.zone_id ? ZONE_BY_ID[a.zone_id]?.name ?? "Area" : "eThekwini";
      const t = alertText("en", a.hazard, a.level, area, { eased: a.kind === "eased", custom: a.custom });
      return { id: a.id, zoneId: a.zone_id, level: a.level, hazard: a.hazard, kind: a.kind, title: t.title, body: t.body, createdAt: a.created_at };
    }),
    reports,
  });
});
