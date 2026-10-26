import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, limit } from "@/lib/http";
import { currentEvent } from "@/lib/status";
import { getUser } from "@/lib/users";
import { USSD_CODE } from "@/lib/emergency";

/** Send a family member an SMS with a one-tap check-in link (SMS is simulated: see Messages). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireUser();
  limit(req, "ping", 20, 60_000);
  const id = Number((await ctx.params).id);
  const f = await one<{ id: number; name: string; phone: string; token: string }>(`SELECT id, name, phone, token FROM family WHERE id = $1 AND user_id = $2`, [id, s.uid]);
  if (!f) return json({ error: "Not found." }, 404);
  const u = await getUser(s.uid);
  const ev = await currentEvent();
  const origin = new URL(req.url).origin;
  const link = `${origin}/c/${f.token}`;
  await q(`UPDATE family SET pinged_at = now() WHERE id = $1`, [id]);
  await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'sms',$5)`, [
    ev.id, u.id, f.name, f.phone, `StormShield: ${u.first_name} wants to know you are safe. Tap to check in: ${link} or dial ${USSD_CODE} (free).`,
  ]);
  return json({ ok: true, link });
});
