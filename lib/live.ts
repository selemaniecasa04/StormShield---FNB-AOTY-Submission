// Live mode: real forecasts from Open-Meteo (free, no key) + GloFAS river discharge.
import "server-only";
import { RIVERS, ZONES, type RiverId } from "./geo";
import { cityOf, HORIZON, PAST, summarise, type Snapshot, type ZoneState } from "./engine";

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const FLOOD = "https://flood-api.open-meteo.com/v1/flood";
const TTL = 10 * 60 * 1000;

let cache: { at: number; data: Raw | null; failedAt: number } = { at: 0, data: null, failedAt: 0 };
let inflight: Promise<Raw | null> | null = null;

interface Loc {
  hourly: { time: string[]; precipitation: number[]; soil_moisture_0_to_1cm?: number[]; wind_gusts_10m?: number[]; weather_code?: number[] };
  current?: { time: string; temperature_2m: number; precipitation: number; wind_gusts_10m: number; wind_direction_10m: number; weather_code: number };
}
interface Raw {
  locs: Loc[];
  flood: Record<string, number> | null; // zone id -> discharge ratio (max next 3 days / median)
}

async function fetchJson(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function load(): Promise<Raw | null> {
  if (cache.data && Date.now() - cache.at < TTL) return cache.data;
  if (Date.now() - cache.failedAt < 120_000) return cache.data;
  inflight ??= fetchAll().finally(() => (inflight = null));
  return inflight;
}

async function fetchAll(): Promise<Raw | null> {
  try {
    const lat = ZONES.map((z) => z.c[0]).join(",");
    const lng = ZONES.map((z) => z.c[1]).join(",");
    const q = `latitude=${lat}&longitude=${lng}&hourly=precipitation,soil_moisture_0_to_1cm,wind_gusts_10m,weather_code&current=temperature_2m,precipitation,wind_gusts_10m,wind_direction_10m,weather_code&past_days=1&forecast_days=2&timezone=Africa%2FJohannesburg`;
    const json = await fetchJson(`${FORECAST}?${q}`);
    const locs: Loc[] = Array.isArray(json) ? json : [json];
    let flood: Raw["flood"] = null;
    try {
      const rz = ZONES.filter((z) => z.river);
      const fj = await fetchJson(
        `${FLOOD}?latitude=${rz.map((z) => z.c[0]).join(",")}&longitude=${rz.map((z) => z.c[1]).join(",")}&daily=river_discharge,river_discharge_median&forecast_days=4`,
      );
      const arr = Array.isArray(fj) ? fj : [fj];
      flood = {};
      rz.forEach((z, i) => {
        const d = arr[i]?.daily;
        if (!d) return;
        const max = Math.max(...(d.river_discharge as number[]).filter((x) => x != null));
        const med = Math.max(0.1, ...(d.river_discharge_median as number[]).filter((x) => x != null));
        flood![z.id] = max / med;
      });
    } catch {
      flood = null;
    }
    cache = { at: Date.now(), data: { locs, flood }, failedAt: 0 };
    return cache.data;
  } catch {
    cache.failedAt = Date.now();
    return cache.data; // serve stale data if we have it
  }
}

const WMO: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  80: "Rain showers", 81: "Heavy showers", 82: "Violent showers", 95: "Thunderstorm", 96: "Thunderstorm & hail", 99: "Severe thunderstorm & hail",
};
export const wmoText = (c: number) => WMO[c] ?? "Unsettled";

/** Index of the current hour in an hourly series. */
function nowIndex(times: string[]) {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
  const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}T${String(local.getHours()).padStart(2, "0")}:00`;
  const i = times.indexOf(key);
  return i >= 0 ? i : 24;
}

/** Latest real conditions without waiting on the network (refreshes in the background). */
export function peekActual() {
  void load();
  return actualFrom(cache.data);
}

export async function liveActual() {
  return actualFrom(await load());
}

function actualFrom(raw: Raw | null) {
  const cbd = raw?.locs[ZONES.findIndex((z) => z.id === "cbd")];
  if (!cbd?.current) return null;
  return {
    tempC: cbd.current.temperature_2m,
    rainNow: cbd.current.precipitation,
    gustKmh: Math.round(cbd.current.wind_gusts_10m),
    condition: wmoText(cbd.current.weather_code),
    at: cbd.current.time,
  };
}

export async function liveSnapshot(reports: Record<string, number> = {}): Promise<Snapshot> {
  const raw = await load();
  const generatedAt = new Date().toISOString();
  if (!raw) {
    return {
      ok: false,
      mode: "live",
      hour: null,
      generatedAt,
      title: "Live monitoring",
      zones: [],
      rivers: Object.fromEntries(RIVERS.map((r) => [r.id, Array(PAST + HORIZON + 1).fill(0)])) as Record<RiverId, number[]>,
      gauges: [],
      storm: [],
      weather: { source: "open-meteo", tempC: 0, rainNow: 0, rain24: 0, gustKmh: 0, windFrom: 0, condition: "No live data", hourlyRain: [], actual: null },
      city: { level: "green", worst: null, counts: { green: 0, yellow: 0, orange: 0, red: 0 } },
    };
  }
  const zones: ZoneState[] = ZONES.map((z, zi) => {
    const loc = raw.locs[zi];
    const P = loc.hourly.precipitation.map((x) => x ?? 0);
    const SM = (loc.hourly.soil_moisture_0_to_1cm ?? []).map((x) => x ?? 0.2);
    const G = (loc.hourly.wind_gusts_10m ?? []).map((x) => x ?? 0);
    const W = (loc.hourly.weather_code ?? []).map((x) => x ?? 0);
    const i0 = nowIndex(loc.hourly.time);
    const ratio = raw.flood?.[z.id] ?? 1;
    const n = reports[z.id] ?? 0;
    const parts = (k: number) => {
      const i = Math.min(P.length - 1, i0 + Math.round(k));
      let win = 0;
      for (let j = Math.max(0, i - 18); j <= Math.min(P.length - 1, i + 6); j++) win += P[j];
      let burst = 0;
      for (let j = i; j <= Math.min(P.length - 1, i + 3); j++) burst = Math.max(burst, P[j]);
      const rain = Math.min(35, win * 0.7 + burst * 1.2);
      const soil = Math.min(10, Math.max(0, ((SM[i] ?? 0.2) - 0.2) / 0.22) * 10);
      const river = z.river ? Math.min(30, Math.max(0, ratio - 1) * 12) * (0.5 + z.low / 2) : 0;
      const terrain = 10 * z.low * Math.min(1, (win + 5) / 40);
      const storm = (W[i] ?? 0) >= 95 || (G[i] ?? 0) > 75 ? 5 : 0;
      const community = Math.min(12, n * 4);
      return { rain: rain + storm, river, soil, terrain, community };
    };
    const at = (k: number) => {
      const f = parts(k);
      return Math.min(100, f.rain + f.river + f.soil + f.terrain + f.community);
    };
    const f0 = parts(0);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return summarise(
      {
        id: z.id,
        name: z.name,
        hazard: z.hazard,
        score: at(0),
        factors: { rain: r1(f0.rain), river: r1(f0.river), soil: r1(f0.soil), terrain: r1(f0.terrain), community: f0.community },
        reports: n,
      },
      at,
      z.low,
      !!z.river,
    );
  });
  const cbdIdx = ZONES.findIndex((z) => z.id === "cbd");
  const cbd = raw.locs[cbdIdx];
  const i0 = nowIndex(cbd.hourly.time);
  const P = cbd.hourly.precipitation.map((x) => x ?? 0);
  const rivers = Object.fromEntries(
    RIVERS.map((r) => {
      const zs = ZONES.filter((z) => z.river === r.id).map((z) => raw.flood?.[z.id] ?? 1);
      const stage = Math.min(1, Math.max(0, (Math.max(1, ...zs) - 1) / 3));
      return [r.id, Array(PAST + HORIZON + 1).fill(Math.round(stage * 100) / 100)];
    }),
  ) as Record<RiverId, number[]>;
  const cur = cbd.current;
  return {
    ok: true,
    mode: "live",
    hour: null,
    generatedAt,
    title: "Live monitoring",
    zones,
    rivers,
    gauges: [],
    storm: [],
    weather: {
      source: "open-meteo",
      tempC: cur?.temperature_2m ?? 0,
      rainNow: cur?.precipitation ?? P[i0] ?? 0,
      rain24: Math.round(P.slice(i0, i0 + 24).reduce((a, b) => a + b, 0)),
      gustKmh: Math.round(cur?.wind_gusts_10m ?? 0),
      windFrom: cur?.wind_direction_10m ?? 0,
      condition: wmoText(cur?.weather_code ?? 3),
      hourlyRain: Array.from({ length: HORIZON + 1 }, (_, k) => Math.round((P[i0 + k] ?? 0) * 10) / 10),
      actual: null,
    },
    city: cityOf(zones),
  };
}
