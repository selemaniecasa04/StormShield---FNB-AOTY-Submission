// Emergency response units and dispatch maths (pure: used by server and browser).
import { distanceKm, type LatLng } from "./geo";

export type UnitType = "ems" | "fire" | "swiftwater" | "police" | "transport" | "dm" | "air";

export const UNIT_TYPES: Record<UnitType, { label: string; short: string; speedKmh: number; color: string }> = {
  ems: { label: "Ambulance (EMS)", short: "EMS", speedKmh: 40, color: "#f43f5e" },
  fire: { label: "Fire & Rescue", short: "Fire", speedKmh: 35, color: "#f97316" },
  swiftwater: { label: "Swift-water rescue", short: "Swift-water", speedKmh: 30, color: "#0ea5e9" },
  police: { label: "SAPS", short: "SAPS", speedKmh: 40, color: "#3b82f6" },
  transport: { label: "Evacuation transport", short: "Transport", speedKmh: 25, color: "#22c55e" },
  dm: { label: "Disaster management team", short: "DM team", speedKmh: 35, color: "#a78bfa" },
  air: { label: "Rescue helicopter", short: "Air", speedKmh: 150, color: "#eab308" },
};

export interface UnitSeed {
  id: string;
  name: string;
  type: UnitType;
  base: LatLng;
  phone: string;
}

// Demo fleet. Names are generic; bases are approximate.
export const UNIT_SEED: UnitSeed[] = [
  { id: "ems-14", name: "EMS 14", type: "ems", base: [-29.957, 30.889], phone: "+27313610014" },
  { id: "ems-22", name: "EMS 22", type: "ems", base: [-29.905, 30.889], phone: "+27313610022" },
  { id: "ems-31", name: "EMS 31", type: "ems", base: [-29.861, 31.036], phone: "+27313610031" },
  { id: "ems-8", name: "EMS 8", type: "ems", base: [-29.706, 31.012], phone: "+27313610008" },
  { id: "fr-3", name: "Fire Rescue 3", type: "fire", base: [-29.957, 30.889], phone: "+27313611003" },
  { id: "fr-1", name: "Fire Rescue 1", type: "fire", base: [-29.856, 31.016], phone: "+27313611001" },
  { id: "fr-5", name: "Fire Rescue 5", type: "fire", base: [-29.818, 30.869], phone: "+27313611005" },
  { id: "sw-1", name: "Swift-water 1", type: "swiftwater", base: [-29.934, 31.005], phone: "+27313612001" },
  { id: "sw-2", name: "Swift-water 2", type: "swiftwater", base: [-29.988, 30.931], phone: "+27313612002" },
  { id: "sw-3", name: "Swift-water 3", type: "swiftwater", base: [-29.79, 31.0], phone: "+27313612003" },
  { id: "saps-sr", name: "SAPS Search & Rescue", type: "police", base: [-29.857, 31.02], phone: "+27313613001" },
  { id: "saps-um", name: "SAPS Umlazi van 4", type: "police", base: [-29.961, 30.894], phone: "+27313613004" },
  { id: "bus-1", name: "Evacuation bus 1", type: "transport", base: [-29.918, 30.874], phone: "+27313614001" },
  { id: "bus-2", name: "Evacuation bus 2", type: "transport", base: [-29.703, 31.004], phone: "+27313614002" },
  { id: "dm-a", name: "DM field team A", type: "dm", base: [-29.857, 31.022], phone: "+27313615001" },
  { id: "dm-b", name: "DM field team B", type: "dm", base: [-29.984, 30.894], phone: "+27313615002" },
  { id: "air-1", name: "Rescue helicopter", type: "air", base: [-29.614, 31.119], phone: "+27313616001" },
];

/** Best unit type for a help request. */
export function recommendType(ticketType: string): UnitType {
  switch (ticketType) {
    case "medical":
      return "ems";
    case "rescue":
    case "stranded":
      return "swiftwater";
    case "flooded":
      return "fire";
    case "transport":
      return "transport";
    default:
      return "dm";
  }
}

export function etaMinutes(from: LatLng, to: LatLng, type: UnitType) {
  const d = distanceKm(from, to);
  if (type === "air") return Math.max(4, Math.round((d / UNIT_TYPES.air.speedKmh) * 60 + 4));
  return Math.max(3, Math.round(((d * 1.35) / UNIT_TYPES[type].speedKmh) * 60));
}

/** Where a dispatched unit is now, moving in a straight line from base to the incident. */
export function unitPosition(base: LatLng, target: LatLng | null, dispatchedAt: string | null, etaAt: string | null, status: string): LatLng {
  if (!target || !dispatchedAt || !etaAt) return base;
  if (status === "on_scene") return target;
  const t0 = new Date(dispatchedAt).getTime();
  const t1 = new Date(etaAt).getTime();
  const f = Math.max(0, Math.min(1, (Date.now() - t0) / Math.max(1, t1 - t0)));
  return [base[0] + (target[0] - base[0]) * f, base[1] + (target[1] - base[1]) * f];
}

export interface UnitRow {
  id: string;
  name: string;
  type: UnitType;
  base: LatLng;
  phone: string;
  status: "available" | "dispatched" | "on_scene";
  ticketId: number | null;
  p: LatLng;
  etaAt: string | null;
  ticketRef: string | null;
}
