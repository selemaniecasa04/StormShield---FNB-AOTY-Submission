// Checks a damage claim against the flood model at the claimed location.
import { isFlooded, nearestRiver, zoneAt, type LatLng } from "./geo";
import { PAST, type Snapshot } from "./engine";
import { rank } from "./risk";

export function validateClaim(snap: Snapshot, p: LatLng, depthCm: number | null) {
  const stage = (r: string, t: number) => {
    const arr = snap.rivers[r as keyof typeof snap.rivers] ?? [];
    // Peak stage over the past 3 hours and the next 3, at this point along the river.
    let best = 0;
    for (let k = 0; k <= PAST + 3 && k < arr.length; k++) best = Math.max(best, arr[Math.max(0, Math.min(arr.length - 1, k + Math.round(3 * (1 - t)) - 3))] ?? 0);
    return best;
  };
  const inExtent = snap.ok && isFlooded(p, stage);
  const zone = zoneAt(p);
  const z = zone ? snap.zones.find((x) => x.id === zone.id) : null;
  const zoneHot = !!z && rank(z.level) >= 2;
  const modelDepth = z ? Math.max(z.depthM, 0) : 0;
  const nr = nearestRiver(p);
  const reported = depthCm != null ? depthCm / 100 : null;
  const tooDeep = reported != null && reported > modelDepth * 1.6 + 0.3;
  const consistent = (inExtent || zoneHot) && !tooDeep;
  const parts: string[] = [];
  parts.push(inExtent ? `Inside modelled flood extent of ${nr.river.name}` : `Outside modelled river flood extent (${nr.river.name} ${nr.distKm.toFixed(1)} km away)`);
  if (z) parts.push(`${zone!.name} was at ${z.category.toLowerCase()} (score ${z.score})`);
  parts.push(`modelled depth up to ${modelDepth.toFixed(1)} m`);
  if (tooDeep) parts.push(`reported depth ${reported!.toFixed(1)} m is higher than modelled`);
  return { validation: consistent ? "consistent" : "review", note: parts.join("; ") + ".", modelDepth };
}
