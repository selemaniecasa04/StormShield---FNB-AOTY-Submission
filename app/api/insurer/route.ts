import { q, one } from "@/lib/db";
import { requireInsurer } from "@/lib/auth";
import { body, handle, json, num, str } from "@/lib/http";
import { audit, getSnapshot } from "@/lib/status";
import { createCampaign } from "@/lib/outreach";
import { outreachData } from "@/lib/admin-data";
import { ZONE_BY_ID } from "@/lib/geo";
import { rank } from "@/lib/risk";
import { AVG_CONTENTS_FLOOD_CLAIM, AVG_VEHICLE_FLOOD_CLAIM, claimRef, insurerName } from "@/lib/insurance";

export const dynamic = "force-dynamic";

async function staff(uid: number) {
  const me = await one<{ first_name: string; surname: string; insurer_id: string; org: string | null }>(`SELECT first_name, surname, insurer_id, org FROM users WHERE id = $1`, [uid]);
  return { name: `${me?.first_name} ${me?.surname}`, insurerId: me?.insurer_id ?? "shieldsure", org: me?.org };
}

export const GET = handle(async () => {
  const s = await requireInsurer();
  const me = await staff(s.uid);
  const { snap, event } = await getSnapshot();
  const zs = Object.fromEntries(snap.zones.map((z) => [z.id, z]));
  // Only policyholders who agreed to share their StormShield data with this insurer.
  const rows = await q<{
    id: number; first_name: string; surname: string; phone: string; home_address: string; home_zone: string | null; home_lat: number; home_lng: number;
    policy_no: string; cover: string; sum_insured: number | null; vehicle_desc: string | null; mitigated_at: string | null; vulnerable: string;
    status: string | null; call_status: string | null; call_result: string | null; call_attempts: number | null; alerts: number;
  }>(
    `SELECT u.id, u.first_name, u.surname, u.phone, u.home_address, u.home_zone, u.home_lat, u.home_lng, u.policy_no, u.cover, u.sum_insured, u.vehicle_desc, u.mitigated_at, u.vulnerable,
            c.status, o.status AS call_status, o.result AS call_result, o.attempts AS call_attempts,
            (SELECT count(DISTINCT alert_id)::int FROM messages m WHERE m.user_id = u.id AND m.event_id = $2 AND m.alert_id IS NOT NULL) AS alerts
     FROM users u
     LEFT JOIN LATERAL (SELECT status FROM checkins WHERE user_id = u.id AND event_id = $2 ORDER BY created_at DESC LIMIT 1) c ON true
     LEFT JOIN LATERAL (SELECT status, result, attempts FROM outreach_targets WHERE user_id = u.id AND event_id = $2 ORDER BY id DESC LIMIT 1) o ON true
     WHERE u.role = 'user' AND u.insurer_id = $1 AND u.insurer_consent ORDER BY u.surname`,
    [me.insurerId, event.id],
  );
  const holders = rows.map((u) => {
    const z = u.home_zone ? zs[u.home_zone] : null;
    const cover = u.cover ? u.cover.split(",").filter(Boolean) : [];
    return {
      id: u.id, name: `${u.first_name} ${u.surname}`, phone: u.phone, address: u.home_address, p: [u.home_lat, u.home_lng] as [number, number],
      zone: z?.name ?? null, level: z?.level ?? null, score: z?.score ?? 0, depthM: z?.depthM ?? 0, peakIn: z?.peakIn ?? null,
      policyNo: u.policy_no, cover, sumInsured: u.sum_insured ?? 0, vehicle: u.vehicle_desc, mitigatedAt: u.mitigated_at,
      vulnerable: !!u.vulnerable, status: u.status, call: u.call_status ? { status: u.call_status, result: u.call_result, attempts: u.call_attempts } : null, alerts: u.alerts,
    };
  });
  const atRisk = holders.filter((h) => h.level && rank(h.level) >= 2);
  const red = holders.filter((h) => h.level === "red");
  const vehiclesAtRisk = atRisk.filter((h) => h.cover.includes("vehicle"));
  const mitigated = atRisk.filter((h) => h.mitigatedAt);
  const reached = atRisk.filter((h) => h.call?.status === "reached" || h.status === "safe" || h.status === "evacuating");
  const avoided =
    mitigated.filter((h) => h.cover.includes("vehicle")).length * AVG_VEHICLE_FLOOD_CLAIM + mitigated.filter((h) => h.cover.includes("contents")).length * AVG_CONTENTS_FLOOD_CLAIM * 0.3;
  const byZone = Object.values(
    holders.reduce<Record<string, { zone: string; level: string | null; count: number; sum: number; mitigated: number }>>((a, h) => {
      const k = h.zone ?? "Outside demo city";
      a[k] ??= { zone: k, level: h.level, count: 0, sum: 0, mitigated: 0 };
      a[k].count++;
      a[k].sum += h.sumInsured;
      if (h.mitigatedAt) a[k].mitigated++;
      return a;
    }, {}),
  ).sort((a, b) => rank((b.level ?? "green") as never) - rank((a.level ?? "green") as never) || b.sum - a.sum);

  const claims = await q<{
    id: number; user_id: number; kind: string; description: string; depth_cm: number | null; lat: number; lng: number; photos: string; status: string; validation: string;
    validation_note: string; model_depth: number | null; alerted_before: boolean; mitigated: boolean; assessor: string | null; amount: number | null; created_at: string; updated_at: string;
    name: string; phone: string; policy_no: string; home_address: string; home_zone: string | null; sum_insured: number | null;
  }>(
    `SELECT c.*, u.first_name || ' ' || u.surname AS name, u.phone, u.policy_no, u.home_address, u.home_zone, u.sum_insured
     FROM claims c JOIN users u ON u.id = c.user_id WHERE c.insurer_id = $1 ORDER BY (c.status IN ('settled','rejected')), c.id DESC`,
    [me.insurerId],
  );

  const outreach = await outreachData(event.id, me.insurerId);

  return json({
    insurer: { id: me.insurerId, name: insurerName(me.insurerId), staff: me.name },
    event: { title: event.title, mode: event.mode },
    snap,
    kpi: {
      policyholders: holders.length,
      atRisk: atRisk.length,
      inRed: red.length,
      sumAtRisk: atRisk.reduce((a, h) => a + h.sumInsured, 0),
      vehiclesAtRisk: vehiclesAtRisk.length,
      reached: reached.length,
      mitigated: mitigated.length,
      avoided: Math.round(avoided),
      claimsOpen: claims.filter((c) => !["settled", "rejected"].includes(c.status)).length,
      claimsReview: claims.filter((c) => c.validation === "review" && !["settled", "rejected"].includes(c.status)).length,
    },
    holders,
    byZone,
    claims: claims.map((c) => ({
      id: c.id, ref: claimRef(c.id), kind: c.kind, description: c.description, depthCm: c.depth_cm, p: [c.lat, c.lng], photos: JSON.parse(c.photos || "[]") as string[],
      status: c.status, validation: c.validation, validationNote: c.validation_note, modelDepth: c.model_depth, alertedBefore: c.alerted_before, mitigated: c.mitigated,
      assessor: c.assessor, amount: c.amount, createdAt: c.created_at, updatedAt: c.updated_at, name: c.name, phone: c.phone, policyNo: c.policy_no,
      address: c.home_address, zone: c.home_zone ? ZONE_BY_ID[c.home_zone]?.name : null, sumInsured: c.sum_insured,
    })),
    outreach,
  });
});

/** Pre-loss outreach: call and SMS policyholders in high-risk areas. */
export const POST = handle(async (req: Request) => {
  const s = await requireInsurer();
  const me = await staff(s.uid);
  const b = await body(req);
  const { snap, event } = await getSnapshot();
  const action = str(b.action, 20);
  if (action === "campaign") {
    const zoneIds = snap.zones.filter((z) => rank(z.level) >= (b.scope === "red" ? 3 : 2)).map((z) => z.id);
    if (!zoneIds.length) return json({ error: "No areas are at high risk right now." }, 400);
    const message =
      str(b.message, 300) ||
      `${insurerName(me.insurerId)}: flooding is expected near your insured property. Move vehicles and valuables to higher ground now and keep your policy number with you.`;
    const r = await createCampaign(q, {
      eventId: event.id, title: `${insurerName(me.insurerId)} pre-loss calls · ${b.scope === "red" ? "extreme" : "high and extreme"} risk`, kind: b.scope === "red" ? "evacuate" : "warning",
      audience: "insurer", insurerId: me.insurerId, zoneIds, createdBy: s.uid, message,
    });
    await audit(s.uid, me.name, "outreach", `Insurer campaign: ${r.count} policyholders queued`);
    return json({ ok: true, count: r.count });
  }
  if (action === "call") {
    const userId = num(b.userId);
    const ok = await one(`SELECT id FROM users WHERE id = $1 AND insurer_id = $2 AND insurer_consent`, [userId, me.insurerId]);
    if (!ok) return json({ error: "Policyholder not found." }, 404);
    const r = await createCampaign(q, {
      eventId: event.id, title: `${insurerName(me.insurerId)} call to policyholder`, kind: "warning", audience: "single", userIds: [userId!], createdBy: s.uid, insurerId: me.insurerId,
      message: `${insurerName(me.insurerId)}: flooding is expected near your insured property. Move vehicles and valuables to higher ground now.`, delaySec: 1,
    });
    if (!r.count) return json({ error: "A call to this person is already in progress." }, 409);
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
});
