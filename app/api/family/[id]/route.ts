import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, str } from "@/lib/http";
import { currentEvent } from "@/lib/status";
import { CHECK_META } from "@/lib/risk";

type Ctx = { params: Promise<{ id: string }> };

async function own(uid: number, id: number) {
  return one<{ id: number; linked_user_id: number | null }>(`SELECT id, linked_user_id FROM family WHERE id = $1 AND user_id = $2`, [id, uid]);
}

/** Manually record a family member's status (e.g. after a phone call). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const s = await requireUser();
  const id = Number((await ctx.params).id);
  const f = await own(s.uid, id);
  if (!f) return json({ error: "Not found." }, 404);
  if (f.linked_user_id) return json({ error: "This person checks in from their own StormShield account." }, 400);
  const b = await body(req);
  const status = str(b.status, 30);
  if (status !== "pending" && !(status in CHECK_META)) return json({ error: "Unknown status." }, 400);
  const ev = await currentEvent();
  if (status === "pending") await q(`UPDATE family SET status = NULL, status_event = NULL, status_at = NULL WHERE id = $1`, [id]);
  else await q(`UPDATE family SET status = $2, status_event = $3, status_at = now() WHERE id = $1`, [id, status, ev.id]);
  return json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const s = await requireUser();
  const id = Number((await ctx.params).id);
  if (!(await own(s.uid, id))) return json({ error: "Not found." }, 404);
  await q(`DELETE FROM family WHERE id = $1`, [id]);
  return json({ ok: true });
});
