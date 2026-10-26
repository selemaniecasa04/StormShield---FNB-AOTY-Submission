import { q, one } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, handle, json, num, str } from "@/lib/http";
import { audit, getSnapshot } from "@/lib/status";
import { createCampaign, markReached } from "@/lib/outreach";
import { outreachData } from "@/lib/admin-data";
import { ZONE_BY_ID } from "@/lib/geo";
import { rank } from "@/lib/risk";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  const { event } = await getSnapshot();
  return json(await outreachData(event.id));
});

export const POST = handle(async (req: Request) => {
  const s = await requireAdmin();
  const me = await one<{ first_name: string; surname: string }>(`SELECT first_name, surname FROM users WHERE id = $1`, [s.uid]);
  const actor = `${me?.first_name} ${me?.surname}`;
  const b = await body(req);
  const action = str(b.action, 20);
  const { snap, event } = await getSnapshot();

  if (action === "launch") {
    const kind = b.kind === "evacuate" ? "evacuate" : "warning";
    const audience = b.audience === "vulnerable" ? "vulnerable" : "zone";
    let zoneIds = (Array.isArray(b.zoneIds) ? b.zoneIds : []).filter((z): z is string => typeof z === "string" && !!ZONE_BY_ID[z]);
    if (b.preset === "red") zoneIds = snap.zones.filter((z) => z.level === "red").map((z) => z.id);
    if (b.preset === "orange+") zoneIds = snap.zones.filter((z) => rank(z.level) >= 2).map((z) => z.id);
    if (!zoneIds.length) return json({ error: "Choose at least one area." }, 400);
    const title = `${kind === "evacuate" ? "Evacuation" : "Warning"} calls${audience === "vulnerable" ? " (vulnerable)" : ""} · ${zoneIds.map((z) => ZONE_BY_ID[z].name).join(", ")}`;
    const r = await createCampaign(q, { eventId: event.id, title, kind, audience, zoneIds, createdBy: s.uid, message: str(b.message, 300) || null });
    await audit(s.uid, actor, "outreach", `${title}: ${r.count} people queued`);
    return json({ ok: true, count: r.count });
  }

  if (action === "call") {
    const userId = num(b.userId);
    if (!userId) return json({ error: "Choose a resident." }, 400);
    const r = await createCampaign(q, { eventId: event.id, title: "Individual call by staff", kind: b.kind === "evacuate" ? "evacuate" : "warning", audience: "single", userIds: [userId], createdBy: s.uid, delaySec: 1 });
    if (!r.count) return json({ error: "A call to this person is already in progress." }, 409);
    await audit(s.uid, actor, "outreach", `Called resident #${userId}`);
    return json({ ok: true });
  }

  if (action === "reached") {
    const id = num(b.targetId);
    if (!id) return json({ error: "Target required." }, 400);
    await markReached(q, id, str(b.note, 200) || "Reached by staff");
    await audit(s.uid, actor, "outreach", `Marked outreach target #${id} as reached`);
    return json({ ok: true });
  }

  if (action === "stop") {
    const id = num(b.campaignId);
    await q(`UPDATE outreach_targets SET status = 'cancelled', updated_at = now() WHERE campaign_id = $1 AND status = 'queued'`, [id]);
    await audit(s.uid, actor, "outreach", `Stopped campaign #${id}`);
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
});
