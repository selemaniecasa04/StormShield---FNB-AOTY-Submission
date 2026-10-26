// Helpers to read a snapshot at a (fractional) forecast offset, so the map can animate.
import { GAUGES, PLACES, RIVERS, ROAD_CLOSURES, isFlooded, ribbon, type LatLng, type RiverId } from "@/lib/geo";
import { PAST, HORIZON, type Snapshot } from "@/lib/engine";
import { levelOf, type Level } from "@/lib/risk";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function sample(arr: number[], idx: number) {
  if (!arr.length) return 0;
  const i = Math.max(0, Math.min(arr.length - 1, idx));
  const lo = Math.floor(i);
  const hi = Math.min(arr.length - 1, lo + 1);
  return lerp(arr[lo], arr[hi], i - lo);
}

export function zoneScoreAt(snap: Snapshot, id: string, o: number) {
  const z = snap.zones.find((x) => x.id === id);
  if (!z) return 0;
  return o <= 0 ? z.score : sample(z.forecast, o);
}

export function zonesAt(snap: Snapshot, o: number): Record<string, { score: number; level: Level }> {
  const out: Record<string, { score: number; level: Level }> = {};
  for (const z of snap.zones) {
    const score = o <= 0 ? z.score : sample(z.forecast, o);
    out[z.id] = { score, level: levelOf(score) };
  }
  return out;
}

export function riverStageAt(snap: Snapshot, id: RiverId, o: number, lead = 0) {
  return sample(snap.rivers[id] ?? [], PAST + o + lead);
}

/** Flood extent ribbons for each river: outer (shallow) and inner (deep) polygons. */
export function floodRibbons(snap: Snapshot, o: number) {
  const out: { id: RiverId; name: string; outer: LatLng[]; inner: LatLng[] | null; stage: number }[] = [];
  for (const r of RIVERS) {
    const mouth = riverStageAt(snap, r.id, o);
    const peakish = Math.max(mouth, riverStageAt(snap, r.id, o, 3));
    if (peakish < 0.06) continue;
    const stageAt = (t: number) => riverStageAt(snap, r.id, o, 3 * (1 - t));
    const outer = ribbon(r.line, (t) => 40 + r.width * Math.pow(stageAt(t), 1.3) * (0.35 + 0.65 * t));
    const deep = mouth > 0.45 || stageAt(0.5) > 0.45;
    const inner = deep ? ribbon(r.line, (t) => 25 + r.width * 0.42 * Math.pow(Math.max(0, stageAt(t) - 0.35) / 0.65, 1.2) * (0.35 + 0.65 * t)) : null;
    out.push({ id: r.id, name: r.name, outer, inner, stage: mouth });
  }
  return out;
}

export function closuresAt(snap: Snapshot, o: number) {
  const z = zonesAt(snap, o);
  return ROAD_CLOSURES.map((rc) => {
    const stage = rc.river ? riverStageAt(snap, rc.river, o) : (z[rc.zone]?.score ?? 0) / 100;
    return { ...rc, closed: snap.ok && stage >= rc.threshold };
  });
}

export function gaugesAt(snap: Snapshot, o: number) {
  return GAUGES.map((g) => {
    const s = snap.gauges.find((x) => x.id === g.id);
    const level = s ? sample(s.series, 6 + o) : null;
    return { ...g, level, series: s?.series ?? [] };
  });
}

export function stormAt(snap: Snapshot, o: number) {
  if (!snap.storm.length) return null;
  const i = Math.max(0, Math.min(snap.storm.length - 1, o));
  const lo = Math.floor(i);
  const hi = Math.min(snap.storm.length - 1, lo + 1);
  const t = i - lo;
  const a = snap.storm[lo];
  const b = snap.storm[hi];
  return {
    p: [lerp(a.p[0], b.p[0], t), lerp(a.p[1], b.p[1], t)] as LatLng,
    radiusKm: lerp(a.radiusKm, b.radiusKm, t),
    intensity: lerp(a.intensity, b.intensity, t),
    heading: a.heading,
    track: snap.storm.map((s) => s.p),
  };
}

export { HORIZON };

/** Places (shelters, halls) cut off by the modelled flood extent at this offset. */
export function floodedPlaces(snap: Snapshot | null, o: number) {
  const out: Record<string, boolean> = {};
  if (!snap?.ok) return out;
  for (const p of PLACES) {
    if (p.type !== "shelter" && p.type !== "hall") continue;
    out[p.id] = isFlooded(p.p, (r, t) => riverStageAt(snap, r, o, 3 * (1 - t)));
  }
  return out;
}
