import { handle, json, limit, num, str } from "@/lib/http";
import { SUBURBS, zoneAt, type LatLng } from "@/lib/geo";

export const dynamic = "force-dynamic";

const UA = `StormShield/2.0 (${process.env.GEOCODER_CONTACT || "hackathon demo"})`;

async function nominatim(path: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/${path}`, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const GET = handle(async (req: Request) => {
  limit(req, "geo", 60, 60_000);
  const url = new URL(req.url);
  const lat = num(url.searchParams.get("lat"));
  const lng = num(url.searchParams.get("lng"));
  if (lat !== null && lng !== null) {
    const p: LatLng = [lat, lng];
    const zone = zoneAt(p);
    const rev = await nominatim(`reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17`);
    const label = rev?.display_name ? String(rev.display_name).split(",").slice(0, 3).join(",").trim() : zone ? `Near ${zone.name}` : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    return json({ label, p, zone: zone?.id ?? null });
  }
  const qs = str(url.searchParams.get("q"), 120);
  if (qs.length < 2) return json({ results: [] });
  const needle = qs.toLowerCase();
  const local = SUBURBS.filter((s) => s.name.toLowerCase().includes(needle))
    .slice(0, 5)
    .map((s) => ({ label: s.name, p: s.p, source: "local" }));
  let remote: { label: string; p: LatLng; source: string }[] = [];
  if (local.length < 5 && qs.length >= 3) {
    const res = await nominatim(`search?format=jsonv2&countrycodes=za&limit=5&q=${encodeURIComponent(qs)}`);
    if (Array.isArray(res)) {
      remote = res.map((r: { display_name: string; lat: string; lon: string }) => ({
        label: r.display_name.split(",").slice(0, 4).join(",").trim(),
        p: [+r.lat, +r.lon] as LatLng,
        source: "osm",
      }));
    }
  }
  return json({ results: [...local, ...remote].slice(0, 7) });
});
