import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, num, str } from "@/lib/http";
import { getTarget, respond } from "@/lib/outreach";
import { floodedFn, getSnapshot } from "@/lib/status";
import type { Key } from "@/lib/outreach-text";

/** The resident answers, declines, or presses a key on the simulated StormShield call. */
export const POST = handle(async (req: Request) => {
  const s = await requireUser();
  const b = await body(req);
  const id = num(b.targetId);
  const action = str(b.action, 10) as "answer" | "decline" | "key";
  const key = str(b.key, 1) as Key;
  if (!id || !["answer", "decline", "key"].includes(action)) return json({ error: "Invalid request." }, 400);
  if (action === "key" && !["1", "2", "3", "4", "5"].includes(key)) return json({ error: "Invalid key." }, 400);
  const t = await getTarget(q, id);
  if (!t || t.user_id !== s.uid) return json({ error: "Call not found." }, 404);
  if (!["ringing", "in_call"].includes(t.status)) return json({ error: "This call has ended." }, 409);
  const { snap } = await getSnapshot();
  const r = await respond(q, t, action, action === "key" ? key : null, floodedFn(snap));
  return json({ ok: true, ticket: r.ticket });
});
