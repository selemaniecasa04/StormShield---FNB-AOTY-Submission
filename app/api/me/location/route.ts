import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, num } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const s = await requireUser();
  const b = await body(req);
  const lat = num(b.lat);
  const lng = num(b.lng);
  if (b.clear === true) {
    await q(`UPDATE users SET gps_lat = NULL, gps_lng = NULL, gps_at = NULL WHERE id = $1`, [s.uid]);
    return json({ ok: true });
  }
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "Invalid location." }, 400);
  await q(`UPDATE users SET gps_lat = $2, gps_lng = $3, gps_at = now() WHERE id = $1`, [s.uid, lat, lng]);
  return json({ ok: true });
});
