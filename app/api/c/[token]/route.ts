// Public check-in link for family members who don't have a StormShield account.
import { q, one } from "@/lib/db";
import { body, handle, json, limit, str } from "@/lib/http";
import { currentEvent } from "@/lib/status";
import { CHECK_META } from "@/lib/risk";

type Ctx = { params: Promise<{ token: string }> };

async function find(token: string) {
  if (!/^[a-z0-9]{8,64}$/i.test(token)) return null;
  return one<{ id: number; name: string; user_id: number; status: string | null; status_event: number | null; status_at: string | null; inviter: string; inviter_phone: string }>(
    `SELECT f.id, f.name, f.user_id, f.status, f.status_event, f.status_at, u.first_name AS inviter, u.phone AS inviter_phone
     FROM family f JOIN users u ON u.id = f.user_id WHERE f.token = $1`,
    [token],
  );
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const f = await find((await ctx.params).token);
  if (!f) return json({ error: "This check-in link is not valid." }, 404);
  const ev = await currentEvent();
  return json({ name: f.name.split(" ")[0], inviter: f.inviter, status: f.status_event === ev.id ? f.status : null, statusAt: f.status_at });
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  limit(req, "famcheck", 20, 60_000);
  const f = await find((await ctx.params).token);
  if (!f) return json({ error: "This check-in link is not valid." }, 404);
  const b = await body(req);
  const status = str(b.status, 30);
  if (!(status in CHECK_META)) return json({ error: "Unknown status." }, 400);
  const ev = await currentEvent();
  await q(`UPDATE family SET status = $2, status_event = $3, status_at = now() WHERE id = $1`, [f.id, status, ev.id]);
  await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'push',$5)`, [
    ev.id, f.user_id, f.inviter, f.inviter_phone, `${f.name} checked in: ${CHECK_META[status as keyof typeof CHECK_META].label}.`,
  ]);
  return json({ ok: true });
});
