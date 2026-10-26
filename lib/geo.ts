// Static GIS data for the Durban (eThekwini) showcase city.
// Facility and road locations are approximate and for demonstration only.
import source from "./data/zones-source.json";
import polys from "./data/zones-poly.json";

export type LatLng = [number, number];
export type Hazard = "flood" | "rain" | "landslide" | "wind" | "road";
export type RiverId = "mngeni" | "mbilo" | "mlazi" | "isipingo";

export interface Zone {
  id: string;
  name: string;
  c: LatLng;
  river: RiverId | null;
  low: number; // 0..1 how low-lying / flood-exposed
  pop: number;
  peak: number; // drill: peak risk score
  pk: number; // drill: hour of peak
  hazard: Hazard;
  poly: LatLng[];
}

export const CITY = { name: "Durban (eThekwini)", center: [-29.865, 30.965] as LatLng, zoom: 11 };
export const BOUNDARY = source.boundary as unknown as LatLng[];
export const ZONES: Zone[] = (source.zones as Omit<Zone, "poly">[]).map((z) => ({
  ...z,
  river: z.river as RiverId | null,
  poly: (polys as unknown as Record<string, LatLng[]>)[z.id],
}));
export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<string, Zone>;

export interface River {
  id: RiverId;
  name: string;
  pk: number; // drill hour of peak at the mouth
  width: number; // max flood ribbon width in metres
  line: LatLng[]; // upstream -> mouth
}

export const RIVERS: River[] = [
  {
    id: "mngeni",
    name: "uMngeni River",
    pk: 10,
    width: 900,
    line: [[-29.712, 30.86], [-29.72, 30.885], [-29.725, 30.905], [-29.735, 30.925], [-29.742, 30.945], [-29.752, 30.962], [-29.765, 30.978], [-29.778, 30.99], [-29.79, 31.002], [-29.799, 31.016], [-29.805, 31.028], [-29.809, 31.042]],
  },
  {
    id: "mbilo",
    name: "uMbilo River",
    pk: 6,
    width: 520,
    line: [[-29.822, 30.875], [-29.83, 30.9], [-29.84, 30.922], [-29.851, 30.942], [-29.861, 30.958], [-29.869, 30.972], [-29.876, 30.986], [-29.884, 31.0]],
  },
  {
    id: "mlazi",
    name: "uMlazi River",
    pk: 8,
    width: 1050,
    line: [[-29.93, 30.81], [-29.938, 30.835], [-29.947, 30.858], [-29.955, 30.878], [-29.962, 30.898], [-29.962, 30.92], [-29.958, 30.942], [-29.955, 30.962], [-29.958, 30.978], [-29.963, 30.992]],
  },
  {
    id: "isipingo",
    name: "Isipingo River",
    pk: 7,
    width: 780,
    line: [[-29.982, 30.86], [-29.986, 30.88], [-29.99, 30.9], [-29.994, 30.918], [-29.998, 30.932], [-30.003, 30.945]],
  },
];
export const RIVER_BY_ID = Object.fromEntries(RIVERS.map((r) => [r.id, r])) as Record<RiverId, River>;

export type PlaceType = "shelter" | "police" | "hospital" | "fire" | "hall";
export interface Place {
  id: string;
  type: PlaceType;
  name: string;
  p: LatLng;
  capacity?: number;
  phone?: string;
}

export const PLACES: Place[] = [
  { id: "sh-chatsworth", type: "shelter", name: "Chatsworth Youth Centre", p: [-29.918, 30.874], capacity: 600 },
  { id: "sh-isiphills", type: "shelter", name: "Isipingo Hills Civic Hall", p: [-29.984, 30.894], capacity: 350 },
  { id: "sh-bluff", type: "shelter", name: "Bluff Community Hall", p: [-29.934, 31.012], capacity: 300 },
  { id: "sh-berea", type: "shelter", name: "Berea Recreation Centre", p: [-29.843, 30.996], capacity: 400 },
  { id: "sh-icc", type: "shelter", name: "Durban ICC Mass Shelter", p: [-29.855, 31.03], capacity: 2000 },
  { id: "sh-phoenix", type: "shelter", name: "Phoenix Community Hall", p: [-29.703, 31.004], capacity: 450 },
  { id: "sh-westville", type: "shelter", name: "Westville Civic Centre", p: [-29.832, 30.928], capacity: 300 },
  { id: "sh-umlazi", type: "shelter", name: "Umlazi V Section Hall", p: [-29.959, 30.889], capacity: 500 },
  { id: "sh-kingsburgh", type: "shelter", name: "Kingsburgh Civic Hall", p: [-30.038, 30.852], capacity: 250 },
  { id: "sh-pinetown", type: "shelter", name: "Pinetown Civic Centre", p: [-29.816, 30.858], capacity: 500 },
  { id: "sh-kwamashu", type: "shelter", name: "KwaMashu Indoor Centre", p: [-29.738, 30.98], capacity: 400 },
  { id: "po-umlazi", type: "police", name: "Umlazi SAPS", p: [-29.961, 30.894], phone: "10111" },
  { id: "po-isipingo", type: "police", name: "Isipingo SAPS", p: [-29.991, 30.936], phone: "10111" },
  { id: "po-central", type: "police", name: "Durban Central SAPS", p: [-29.857, 31.02], phone: "10111" },
  { id: "po-chatsworth", type: "police", name: "Chatsworth SAPS", p: [-29.911, 30.893], phone: "10111" },
  { id: "po-inanda", type: "police", name: "Inanda SAPS", p: [-29.691, 30.951], phone: "10111" },
  { id: "po-brighton", type: "police", name: "Brighton Beach SAPS", p: [-29.931, 30.999], phone: "10111" },
  { id: "ho-mshiyeni", type: "hospital", name: "Prince Mshiyeni Memorial Hospital", p: [-29.966, 30.906], phone: "10177" },
  { id: "ho-addington", type: "hospital", name: "Addington Hospital", p: [-29.861, 31.04], phone: "10177" },
  { id: "ho-rkkhan", type: "hospital", name: "R K Khan Hospital", p: [-29.905, 30.889], phone: "10177" },
  { id: "ho-ialch", type: "hospital", name: "Inkosi Albert Luthuli Central Hospital", p: [-29.869, 30.952], phone: "10177" },
  { id: "ho-kingedward", type: "hospital", name: "King Edward VIII Hospital", p: [-29.877, 30.99], phone: "10177" },
  { id: "ho-gandhi", type: "hospital", name: "Mahatma Gandhi Memorial Hospital", p: [-29.706, 31.016], phone: "10177" },
  { id: "fi-umlazi", type: "fire", name: "Umlazi Fire Station", p: [-29.957, 30.889], phone: "031 361 0000" },
  { id: "fi-central", type: "fire", name: "Durban Central Fire Station", p: [-29.856, 31.016], phone: "031 361 0000" },
  { id: "fi-isipingo", type: "fire", name: "Isipingo Fire Station", p: [-29.988, 30.931], phone: "031 361 0000" },
  { id: "fi-pinetown", type: "fire", name: "Pinetown Fire Station", p: [-29.818, 30.869], phone: "031 361 0000" },
  { id: "fi-phoenix", type: "fire", name: "Phoenix Fire Station", p: [-29.712, 31.005], phone: "031 361 0000" },
  { id: "ha-inanda", type: "hall", name: "Inanda Community Hall", p: [-29.698, 30.938], capacity: 200 },
  { id: "ha-merebank", type: "hall", name: "Merebank Community Hall", p: [-29.951, 30.975], capacity: 180 },
  { id: "ha-glenwood", type: "hall", name: "Glenwood Community Hall", p: [-29.868, 30.995], capacity: 150 },
  { id: "ha-toti", type: "hall", name: "Amanzimtoti Civic Hall", p: [-30.05, 30.885], capacity: 220 },
];

export interface EvacRoute {
  id: string;
  from: string; // zone id
  to: string; // place id
  name: string;
  line: LatLng[];
}

export const EVAC_ROUTES: EvacRoute[] = [
  { id: "ev-umlazi", from: "umlazi", to: "sh-chatsworth", name: "Umlazi → Chatsworth Youth Centre", line: [[-29.965, 30.885], [-29.957, 30.876], [-29.944, 30.872], [-29.93, 30.873], [-29.918, 30.874]] },
  { id: "ev-isipingo", from: "isipingo", to: "sh-isiphills", name: "Isipingo → Isipingo Hills", line: [[-29.995, 30.928], [-29.993, 30.913], [-29.989, 30.902], [-29.984, 30.894]] },
  { id: "ev-merebank", from: "merebank", to: "sh-bluff", name: "Merebank → Bluff Community Hall", line: [[-29.947, 30.965], [-29.944, 30.983], [-29.94, 30.998], [-29.934, 31.012]] },
  { id: "ev-springfield", from: "springfield", to: "sh-berea", name: "Springfield → Berea Recreation Centre", line: [[-29.805, 31.0], [-29.815, 30.993], [-29.828, 30.99], [-29.843, 30.996]] },
  { id: "ev-inanda", from: "inanda", to: "sh-phoenix", name: "Inanda → Phoenix Community Hall", line: [[-29.7, 30.945], [-29.696, 30.965], [-29.699, 30.985], [-29.703, 31.004]] },
  { id: "ev-umbilo", from: "umbilo", to: "sh-berea", name: "Umbilo → Berea Recreation Centre", line: [[-29.876, 30.985], [-29.865, 30.989], [-29.853, 30.993], [-29.843, 30.996]] },
  { id: "ev-kwamashu", from: "kwamashu", to: "sh-kwamashu", name: "KwaMashu lowlands → Indoor Centre", line: [[-29.755, 30.97], [-29.748, 30.976], [-29.738, 30.98]] },
  { id: "ev-toti", from: "amanzimtoti", to: "sh-kingsburgh", name: "Amanzimtoti → Kingsburgh Civic Hall", line: [[-30.045, 30.875], [-30.043, 30.864], [-30.038, 30.852]] },
  { id: "ev-chatsworth", from: "chatsworth", to: "sh-chatsworth", name: "Chatsworth valley → Youth Centre", line: [[-29.922, 30.895], [-29.92, 30.884], [-29.918, 30.874]] },
];

export interface RoadClosure {
  id: string;
  name: string;
  river: RiverId | null;
  zone: string;
  threshold: number; // river/zone stage (0..1) at which it closes
  line: LatLng[];
}

export const ROAD_CLOSURES: RoadClosure[] = [
  { id: "rc-mangosuthu", name: "Mangosuthu Hwy – uMlazi bridge", river: "mlazi", zone: "umlazi", threshold: 0.55, line: [[-29.967, 30.903], [-29.957, 30.911]] },
  { id: "rc-oldmain", name: "Old Main Rd – Isipingo bridge", river: "isipingo", zone: "isipingo", threshold: 0.5, line: [[-30.0, 30.934], [-29.994, 30.941]] },
  { id: "rc-connaught", name: "Connaught Bridge, Umgeni Rd", river: "mngeni", zone: "springfield", threshold: 0.6, line: [[-29.808, 31.017], [-29.801, 31.024]] },
  { id: "rc-umbilo", name: "Umbilo Rd low point", river: "mbilo", zone: "umbilo", threshold: 0.62, line: [[-29.873, 30.979], [-29.879, 30.989]] },
  { id: "rc-m7", name: "M7 at Umlaas Canal", river: "mlazi", zone: "merebank", threshold: 0.7, line: [[-29.953, 30.956], [-29.949, 30.969]] },
  { id: "rc-inanda", name: "Inanda Rd river crossing", river: "mngeni", zone: "inanda", threshold: 0.5, line: [[-29.722, 30.928], [-29.714, 30.937]] },
  { id: "rc-cbd", name: "Margaret Mncadi Ave underpass", river: null, zone: "cbd", threshold: 0.52, line: [[-29.862, 31.024], [-29.866, 31.031]] },
];

export interface Gauge {
  id: string;
  name: string;
  river: RiverId;
  p: LatLng;
  pos: number; // 0 upstream .. 1 mouth
  base: number; // normal level (m)
  rise: number; // metres above base at full flood
  warn: number;
  danger: number;
}

export const GAUGES: Gauge[] = [
  { id: "g-mngeni-1", name: "uMngeni @ Inanda", river: "mngeni", p: [-29.735, 30.925], pos: 0.35, base: 0.8, rise: 5.2, warn: 3.0, danger: 4.5 },
  { id: "g-mngeni-2", name: "uMngeni @ Springfield", river: "mngeni", p: [-29.79, 31.002], pos: 0.8, base: 1.1, rise: 4.6, warn: 3.0, danger: 4.2 },
  { id: "g-mbilo-1", name: "uMbilo @ Mayville", river: "mbilo", p: [-29.861, 30.958], pos: 0.65, base: 0.5, rise: 3.1, warn: 2.0, danger: 2.8 },
  { id: "g-mlazi-1", name: "uMlazi @ Umlazi D", river: "mlazi", p: [-29.955, 30.878], pos: 0.45, base: 0.9, rise: 4.8, warn: 2.8, danger: 4.0 },
  { id: "g-mlazi-2", name: "uMlazi @ Merebank", river: "mlazi", p: [-29.955, 30.962], pos: 0.85, base: 1.0, rise: 4.2, warn: 2.8, danger: 3.8 },
  { id: "g-isipingo-1", name: "Isipingo @ Prospecton", river: "isipingo", p: [-29.994, 30.918], pos: 0.7, base: 0.6, rise: 3.6, warn: 2.2, danger: 3.2 },
];

export const PLACE_LABEL: Record<PlaceType, string> = {
  shelter: "Emergency shelter",
  police: "Police station",
  hospital: "Hospital",
  fire: "Fire station",
  hall: "Community hall",
};

// ---------- geometry helpers ----------
const R = 6371;
export function distanceKm(a: LatLng, b: LatLng) {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function pointInPolygon(p: LatLng, poly: LatLng[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Zone containing the point, or the nearest zone within 25 km, else null. */
export function zoneAt(p: LatLng): Zone | null {
  const hit = ZONES.find((z) => pointInPolygon(p, z.poly));
  if (hit) return hit;
  let best: Zone | null = null;
  let bd = Infinity;
  for (const z of ZONES) {
    const d = distanceKm(p, z.c);
    if (d < bd) {
      bd = d;
      best = z;
    }
  }
  return bd <= 25 ? best : null;
}

/** Road distance is ~1.35x straight-line in eThekwini; speeds are flood-day estimates. */
export function travelEstimate(km: number) {
  const road = km * 1.35;
  return {
    roadKm: road,
    driveMin: Math.max(2, Math.round((road / 28) * 60)),
    walkMin: Math.max(3, Math.round((road / 4.5) * 60)),
  };
}

/** Densify a polyline into n points evenly spaced along its length, with position 0..1. */
export function densify(line: LatLng[], n = 48): { p: LatLng; t: number }[] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = distanceKm(line[i - 1], line[i]);
    seg.push(d);
    total += d;
  }
  const out: { p: LatLng; t: number }[] = [];
  for (let k = 0; k <= n; k++) {
    let target = (k / n) * total;
    let i = 0;
    while (i < seg.length - 1 && target > seg[i]) {
      target -= seg[i];
      i++;
    }
    const f = seg[i] ? Math.min(1, target / seg[i]) : 0;
    const a = line[i];
    const b = line[i + 1];
    out.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: k / n });
  }
  return out;
}

/** Variable-width ribbon polygon around a line. widthAt(t) returns full width in metres. */
export function ribbon(line: LatLng[], widthAt: (t: number) => number, n = 48): LatLng[] {
  const pts = densify(line, n);
  const left: LatLng[] = [];
  const right: LatLng[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)].p;
    const b = pts[Math.min(pts.length - 1, i + 1)].p;
    const cos = Math.cos((pts[i].p[0] * Math.PI) / 180);
    const dx = (b[1] - a[1]) * cos;
    const dy = b[0] - a[0];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = widthAt(pts[i].t) / 2 / 111320;
    const [lat, lng] = pts[i].p;
    left.push([lat + ny * w, lng + (nx * w) / cos]);
    right.push([lat - ny * w, lng - (nx * w) / cos]);
  }
  return [...left, ...right.reverse()];
}

export function nearestPlaces(p: LatLng, type?: PlaceType, limit = 5) {
  return PLACES.filter((x) => !type || x.type === type)
    .map((x) => ({ ...x, km: distanceKm(p, x.p) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

// Known suburbs for instant address lookups (works offline, Nominatim fills the rest).
export const SUBURBS: { name: string; p: LatLng }[] = [
  ...ZONES.map((z) => ({ name: z.name, p: z.c })),
  { name: "Umlazi D Section", p: [-29.958, 30.875] },
  { name: "Umlazi V Section", p: [-29.968, 30.888] },
  { name: "Umlazi AA Section", p: [-29.975, 30.896] },
  { name: "Lamontville", p: [-29.937, 30.95] },
  { name: "Wentworth", p: [-29.933, 30.985] },
  { name: "Montclair", p: [-29.925, 30.968] },
  { name: "Clairwood", p: [-29.927, 30.977] },
  { name: "Prospecton", p: [-29.982, 30.935] },
  { name: "Glenwood", p: [-29.868, 30.988] },
  { name: "Morningside", p: [-29.83, 31.01] },
  { name: "Greyville", p: [-29.844, 31.016] },
  { name: "Windermere", p: [-29.825, 31.028] },
  { name: "Sydenham", p: [-29.82, 30.98] },
  { name: "Reservoir Hills", p: [-29.81, 30.955] },
  { name: "Clare Estate", p: [-29.8, 30.975] },
  { name: "Newlands East", p: [-29.775, 30.97] },
  { name: "Ntuzuma", p: [-29.72, 30.94] },
  { name: "Lindelani", p: [-29.735, 30.955] },
  { name: "Bhambayi", p: [-29.685, 30.97] },
  { name: "Waterloo", p: [-29.665, 31.03] },
  { name: "La Lucia", p: [-29.755, 31.06] },
  { name: "Kingsburgh", p: [-30.07, 30.86] },
  { name: "Folweni", p: [-30.02, 30.84] },
  { name: "Queensburgh", p: [-29.87, 30.93] },
  { name: "Durban University of Technology (Steve Biko)", p: [-29.852, 31.007] },
  { name: "Moses Mabhida Stadium", p: [-29.829, 31.03] },
  { name: "Hollywoodbets Greyville", p: [-29.84, 31.015] },
  { name: "King Shaka International Airport", p: [-29.614, 31.119] },
  { name: "Pietermaritzburg", p: [-29.601, 30.379] },
  { name: "Ladysmith", p: [-28.56, 29.78] },
  { name: "Port Shepstone", p: [-30.741, 30.455] },
];

/** Nearest point on any river: distance (km) and position along that river (0 upstream .. 1 mouth). */
export function nearestRiver(p: LatLng) {
  let best: { river: River; distKm: number; t: number } | null = null;
  for (const r of RIVERS) {
    const pts = densify(r.line, 60);
    for (const q of pts) {
      const d = distanceKm(p, q.p);
      if (!best || d < best.distKm) best = { river: r, distKm: d, t: q.t };
    }
  }
  return best!;
}

/**
 * Is a point inside the modelled flood extent? stageAt(river, t) gives the river stage (0..1)
 * at position t along it. Mirrors the ribbon drawn on the map, plus a 120 m safety margin.
 */
export function isFlooded(p: LatLng, stageAt: (river: RiverId, t: number) => number) {
  const n = nearestRiver(p);
  const stage = stageAt(n.river.id, n.t);
  const halfWidthM = (40 + n.river.width * Math.pow(stage, 1.3) * (0.35 + 0.65 * n.t)) / 2;
  return n.distKm * 1000 < halfWidthM + 120;
}
