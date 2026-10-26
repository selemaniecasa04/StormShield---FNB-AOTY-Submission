import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, limit } from "@/lib/http";
import { createCampaign } from "@/lib/outreach";
import { currentEvent } from "@/lib/status";

/** Demo: ask StormShield to place a warning call to yourself now. */
export const POST = handle(async (req: Request) => {
  const s = await requireUser();
  limit(req, "preview-call", 5, 60_000);
  const ev = await currentEvent();
  const r = await createCampaign(q, { eventId: ev.id, title: "Test call requested by resident", kind: "warning", audience: "single", userIds: [s.uid], createdBy: s.uid, delaySec: 2 });
  if (!r.count) return json({ error: "A call to you is already in progress." }, 409);
  return json({ ok: true });
});
