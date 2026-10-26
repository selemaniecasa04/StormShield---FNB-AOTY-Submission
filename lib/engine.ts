// Risk engine: builds a city snapshot (zones, rivers, gauges, storm, weather) for "now"
// plus a 12-hour forecast. Pure functions, so the map can replay the forecast in the browser.
import { GAUGES, RIVERS, ZONES, type Hazard, type LatLng, type RiverId, type Zone } from "./geo";
import { ACTIONS, categoryOf, levelOf, type Category, type Level } from "./risk";

export const HORIZON = 12; // forecast hours
export const PAST = 3; // hours of history kept for river stages

export interface Factors {
  rain: number;
  river: number;
  soil: number;
  terrain: number;
  community: number;
}

export interface ZoneState {
  id: string;
  name: string;
  hazard: Hazard;
  score: number;
  level: Level;
  category: Category;
  factors: Factors;
  forecast: number[]; // scores at +0..+HORIZON h
  trend: "rising" | "falling" | "steady";
  orangeIn: number | null; // hours until score >= 50 (0 = now)
  redIn: number | null;
  peakIn: number;
  peakScore: number;
  durationH: number; // hours at or above HIGH risk from now
  depthM: number; // expected peak water depth in low points
  action: string;
  reports: number;
}

export interface WeatherNow {
  source: "simulated" | "open-meteo";
  tempC: number;
  rainNow: number; // mm/h
  rain24: number; // mm over next 24 h
  gustKmh: number;
  windFrom: number; // degrees
  condition: string;
  hourlyRain: number[]; // +0..+HORIZON
  actual?: { tempC: number; rainNow: number; gustKmh: number; condition: string; at: string } | null;
}

export interface Snapshot {
  ok: boolean;
  mode: "drill" | "live";
  hour: number | null; // drill clock (hours since event start)
  generatedAt: string;
  title: string;
  zones: ZoneState[];
  rivers: Record<RiverId, number[]>; // stage 0..1 at -PAST..+HORIZON (mouth)
  gauges: { id: string; level: number; series: number[] }[]; // metres, -6..+HORIZON
  storm: { p: LatLng; radiusKm: number; intensity: number; heading: number }[]; // +0..+HORIZON
  weather: WeatherNow;
  city: { level: Level; worst: string | null; counts: Record<Level, number> };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------- drill model (simulated KZN cut-off low) ----------
export function curve(h: number, pk: number) {
  const w = h < pk ? 3.6 : 6.5;
  return Math.exp(-(((h - pk) / w) ** 2));
}
export function rainRate(h: number) {
  return 38 * Math.exp(-(((h - 5) / 2.6) ** 2)) + 7 * Math.exp(-(((h - 0.5) / 1.8) ** 2)) + (h > -4 && h < 16 ? 1.2 : 0.2);
}
function rainSum(from: number, to: number) {
  let s = 0;
  for (let t = from; t < to; t += 1) s += rainRate(t + 0.5);
  return s;
}
export function riverStage(river: RiverId, h: number, pos = 1) {
  const r = RIVERS.find((x) => x.id === river)!;
  return curve(h, r.pk - 3 * (1 - pos));
}
function soilWet(h: number) {
  return 1 - Math.exp(-rainSum(h - 24, h) / 70);
}

export function drillZoneScore(z: Zone, h: number, reports = 0) {
  const base = 6 + z.low * 8;
  return clamp(base + (z.peak - base) * curve(h, z.pk) + Math.min(12, reports * 4), 0, 100);
}

function drillFactors(z: Zone, h: number, score: number, reports: number): Factors {
  const community = Math.min(12, reports * 4);
  const raw = {
    rain: Math.min(35, rainSum(h - 18, h + 6) * 0.3),
    river: z.river ? 30 * riverStage(z.river, h, 0.8) * z.low : 0,
    soil: 10 * soilWet(h),
    terrain: 10 * z.low,
  };
  const tot = raw.rain + raw.river + raw.soil + raw.terrain || 1;
  const f = (score - community) / tot;
  return {
    rain: round1(raw.rain * f),
    river: round1(raw.river * f),
    soil: round1(raw.soil * f),
    terrain: round1(raw.terrain * f),
    community,
  };
}

const CONDITIONS = (rate: number, gust: number) =>
  rate > 20 ? "Torrential rain" : rate > 8 ? "Heavy rain" : rate > 2 ? "Moderate rain" : rate > 0.5 ? "Light rain" : gust > 50 ? "Windy" : "Overcast";

/** Summarise a forecast series (scores at quarter-hour resolution available via fn). */
export function summarise(
  base: Omit<ZoneState, "forecast" | "trend" | "orangeIn" | "redIn" | "peakIn" | "peakScore" | "durationH" | "depthM" | "action" | "level" | "category">,
  at: (k: number) => number,
  low: number,
  river: boolean,
): ZoneState {
  const forecast: number[] = [];
  for (let k = 0; k <= HORIZON; k++) forecast.push(Math.round(at(k)));
  let orangeIn: number | null = null;
  let redIn: number | null = null;
  let peakIn = 0;
  let peakScore = base.score;
  let dur = 0;
  for (let k = 0; k <= 24; k += 0.25) {
    const s = at(k);
    if (k <= HORIZON) {
      if (orangeIn === null && s >= 50) orangeIn = k;
      if (redIn === null && s >= 75) redIn = k;
      if (s > peakScore + 0.01) {
        peakScore = s;
        peakIn = k;
      }
    }
    if (s >= 50) dur += 0.25;
    else if (k > peakIn && dur > 0) break;
  }
  const next = at(1);
  const trend = next - base.score > 2 ? "rising" : next - base.score < -2 ? "falling" : "steady";
  const depthM = round1(Math.max(0, (peakScore - 45) / 55) * (river ? 2.0 : 0.6) * (0.4 + low));
  const level = levelOf(base.score);
  return {
    ...base,
    score: Math.round(base.score),
    level,
    category: categoryOf(base.score),
    forecast,
    trend,
    orangeIn,
    redIn,
    peakIn,
    peakScore: Math.round(peakScore),
    durationH: dur,
    depthM,
    action: ACTIONS[levelOf(Math.max(base.score, at(Math.min(2, HORIZON))))].headline,
  };
}

export function cityOf(zones: ZoneState[]) {
  const counts: Record<Level, number> = { green: 0, yellow: 0, orange: 0, red: 0 };
  let worst: ZoneState | null = null;
  for (const z of zones) {
    counts[z.level]++;
    if (!worst || z.score > worst.score) worst = z;
  }
  return { level: worst ? worst.level : ("green" as Level), worst: worst ? worst.id : null, counts };
}

export function drillSnapshot(hour: number, reports: Record<string, number> = {}, title = "Flood drill"): Snapshot {
  const zones = ZONES.map((z) => {
    const n = reports[z.id] ?? 0;
    const score = drillZoneScore(z, hour, n);
    return summarise(
      { id: z.id, name: z.name, hazard: z.hazard, score, factors: drillFactors(z, hour, score, n), reports: n },
      (k) => drillZoneScore(z, hour + k, n),
      z.low,
      !!z.river,
    );
  });
  const rivers = Object.fromEntries(
    RIVERS.map((r) => [r.id, Array.from({ length: PAST + HORIZON + 1 }, (_, i) => round2(riverStage(r.id, hour + i - PAST)))]),
  ) as Record<RiverId, number[]>;
  const gauges = GAUGES.map((g) => {
    const series = Array.from({ length: 6 + HORIZON + 1 }, (_, i) => round2(g.base + g.rise * riverStage(g.river, hour + i - 6, g.pos)));
    return { id: g.id, level: series[6], series };
  });
  const storm = Array.from({ length: HORIZON + 1 }, (_, k) => {
    const h = hour + k;
    const f = clamp((h + 4) / 20, 0, 1);
    const rate = rainRate(h);
    return {
      p: [-30.35 + 0.9 * f, 30.45 + 0.9 * f] as LatLng,
      radiusKm: Math.round(10 + 12 * Math.min(1, rate / 38)),
      intensity: round2(Math.min(1, rate / 38)),
      heading: 45,
    };
  });
  const gust = 28 + 52 * Math.exp(-(((hour - 4) / 3.2) ** 2));
  const rate = rainRate(hour);
  const weather: WeatherNow = {
    source: "simulated",
    tempC: round1(19 - 3 * Math.exp(-(((hour - 5) / 4) ** 2))),
    rainNow: round1(rate),
    rain24: Math.round(rainSum(hour, hour + 24)),
    gustKmh: Math.round(gust),
    windFrom: 225,
    condition: CONDITIONS(rate, gust),
    hourlyRain: Array.from({ length: HORIZON + 1 }, (_, k) => round1(rainRate(hour + k))),
  };
  return {
    ok: true,
    mode: "drill",
    hour,
    generatedAt: new Date().toISOString(),
    title,
    zones,
    rivers,
    gauges,
    storm,
    weather,
    city: cityOf(zones),
  };
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Score for an arbitrary point: the zone it falls in (drill) – used for work/GPS locations. */
export function zoneStateFor(snap: Snapshot, zoneId: string | null | undefined) {
  return snap.zones.find((z) => z.id === zoneId) ?? null;
}
