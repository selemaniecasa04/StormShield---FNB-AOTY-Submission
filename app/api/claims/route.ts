import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, limit, num, str } from "@/lib/http";
import { getSnapshot } from "@/lib/status";
import { getUser } from "@/lib/users";
import { validateClaim } from "@/lib/claims";
import { COVER, claimRef, hasPortal, insurerName } from "@/lib/insurance";
import type { LatLng } from "@/lib/geo";

const MAX_PHOTO = 450_000; // characters of base64 data URL per photo

/** First notice of loss: resident reports flood damage to their insurer. */
export const POST = handle(async (req: Request) => {
  const s = await requireUser();
  limit(req, "claim", 6, 60_000);
  const u = await getUser(s.uid);
  if (!u.insurer_id || !u.insurer_consent) return json({ error: "Link your insurance policy in your profile first." }, 400);
  if (!hasPortal(u.insurer_id)) return json({ error: "Your insurer is not connected to StormShield yet. Please contact them directly." }, 400);
  const b = await body(req);
  const kind = str(b.kind, 20);
  if (!(kind in COVER)) return json({ error: "Choose what was damaged." }, 400);
  if (!u.cover.split(",").includes(kind)) return json({ error: `Your policy does not include ${COVER[kind as keyof typeof COVER].toLowerCase()} cover.` }, 400);
  const description = str(b.description, 1000);
  if (description.length < 10) return json({ error: "Describe the damage in a sentence or two." }, 400);
  const depth = num(b.depthCm);
  const depthCm = depth !== null ? Math.max(0, Math.min(500, Math.round(depth))) : null;
  const photos = (Array.isArray(b.photos) ? b.photos : [])
    .filter((x): x is string => typeof x === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length <= MAX_PHOTO)
    .slice(0, 3);
  const lat = num(b.lat) ?? u.home_lat;
  const lng = num(b.lng) ?? u.home_lng;
  const p: LatLng = [lat, lng];

  const { snap, event } = await getSnapshot();
  const v = validateClaim(snap, p, depthCm);
  const alerted = await one<{ n: number }>(`SELECT count(*)::int AS n FROM messages WHERE event_id = $1 AND user_id = $2 AND alert_id IS NOT NULL`, [event.id, u.id]);
  const rows = await q<{ id: number }>(
    `INSERT INTO claims (event_id, user_id, insurer_id, kind, description, depth_cm, lat, lng, photos, validation, validation_note, model_depth, alerted_before, mitigated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [event.id, u.id, u.insurer_id, kind, description, depthCm, lat, lng, JSON.stringify(photos), v.validation, v.note, v.modelDepth, (alerted?.n ?? 0) > 0, !!u.mitigated_at],
  );
  const ref = claimRef(rows[0].id);
  await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'sms',$5)`, [
    event.id, u.id, `${u.first_name} ${u.surname}`, u.phone,
    `${insurerName(u.insurer_id)}: we received your claim ${ref}. Flood data for your address has been attached automatically. We will be in touch.`,
  ]);
  return json({ ok: true, ref });
});
