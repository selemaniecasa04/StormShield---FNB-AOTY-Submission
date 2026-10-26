import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, limit, num, str } from "@/lib/http";
import { currentEvent } from "@/lib/status";
import { zoneAt } from "@/lib/geo";
import { REPORT_KINDS } from "@/lib/risk";

export const POST = handle(async (req: Request) => {
  const s = await requireUser();
  limit(req, "report", 10, 60_000);
  const b = await body(req);
  const kind = str(b.kind, 30);
  if (!(kind in REPORT_KINDS)) return json({ error: "Choose what you are reporting." }, 400);
  const lat = num(b.lat);
  const lng = num(b.lng);
  if (lat === null || lng === null) return json({ error: "Location is required." }, 400);
  const ev = await currentEvent();
  const zone = zoneAt([lat, lng]);
  await q(`INSERT INTO reports (event_id, user_id, kind, note, lat, lng, zone_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [ev.id, s.uid, kind, str(b.note, 280) || null, lat, lng, zone?.id ?? null]);
  return json({ ok: true, zone: zone?.name ?? null });
});
