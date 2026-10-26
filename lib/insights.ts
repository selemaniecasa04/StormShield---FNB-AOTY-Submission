// Lightweight predictive scoring used by the command centre.
import { PLACES, ZONES, zoneAt, distanceKm, isFlooded } from "./geo";
import { rank, type Level } from "./risk";
import { PAST, type Snapshot, type ZoneState } from "./engine";

/** Probability (0..1) that a resident will need rescue/assistance, from risk + vulnerability + response. */
export function needHelpProbability(o: { level: Level | null; depthM: number; vulnerable: number; medical: boolean; status: string | null; minutesSilent: number | null }) {
  if (o.status === "need_help") return 1;
  const lv = o.level ? rank(o.level) : 0;
  const silent = o.status ? 0 : Math.min(1.5, (o.minutesSilent ?? 90) / 60);
  const x = -3.1 + 1.25 * lv + 0.9 * Math.min(2, o.vulnerable) + 0.45 * (o.medical ? 1 : 0) + 0.55 * Math.min(2.5, o.depthM) + 0.6 * silent + (o.status === "vulnerable_present" ? 1.1 : 0);
  let p = 1 / (1 + Math.exp(-x));
  if (o.status === "safe") p *= 0.12;
  if (o.status === "evacuating") p *= 0.45;
  return Math.round(p * 100) / 100;
}

/** Estimated residents inside flood-affected parts of a zone (whole population, not just app users). */
export function estimateAffected(z: ZoneState) {
  const def = ZONES.find((x) => x.id === z.id)!;
  const peak = Math.max(z.score, z.peakScore);
  return Math.round((def.pop * def.low * Math.max(0, (peak - 40) / 60) * 0.1) / 10) * 10;
}

export function shelterPlan(snap: Snapshot) {
  const zones = snap.zones;
  const stage = (r: string, t: number) => {
    const arr = snap.rivers[r as keyof typeof snap.rivers] ?? [];
    const i = Math.max(0, Math.min(arr.length - 1, Math.round(PAST + 3 * (1 - t))));
    return arr[i] ?? 0;
  };
  const shelters = PLACES.filter((p) => p.type === "shelter" || p.type === "hall").map((p) => {
    const zone = zoneAt(p.p);
    const closed = snap.ok && isFlooded(p.p, stage);
    return { id: p.id, name: p.name, type: p.type, p: p.p, capacity: p.capacity ?? 0, zoneId: zone?.id ?? null, open: !closed, demand: 0 };
  });
  for (const z of zones) {
    if (rank(z.level) < 2 && (z.forecast[3] ?? 0) < 50) continue;
    const def = ZONES.find((x) => x.id === z.id)!;
    const open = shelters
      .filter((s) => s.open)
      .sort((a, b) => distanceKm(def.c, a.p) - distanceKm(def.c, b.p))
      .slice(0, 3);
    if (!open.length) continue;
    // Roughly 1 in 40 affected residents is expected to need a shelter bed; spread over the 3 nearest open sites by capacity.
    const displaced = Math.round(estimateAffected(z) * 0.025);
    const cap = open.reduce((a, s) => a + (s.capacity || 100), 0);
    for (const s of open) s.demand += Math.round((displaced * (s.capacity || 100)) / cap);
  }
  return shelters;
}
