import type { LatLng } from "@/lib/geo";

export type Basemap = "dark" | "streets" | "satellite";
export interface Layers {
  zones: boolean;
  labels: boolean;
  flood: boolean;
  flow: boolean;
  evac: boolean;
  shelter: boolean;
  police: boolean;
  hospital: boolean;
  fire: boolean;
  hall: boolean;
  closures: boolean;
  gauges: boolean;
  storm: boolean;
  reports: boolean;
}
export const DEFAULT_LAYERS: Layers = {
  zones: true, labels: true, flood: true, flow: true, evac: true, shelter: true, police: false, hospital: true, fire: false, hall: false,
  closures: true, gauges: true, storm: true, reports: true,
};

export interface PersonMarker {
  id: number;
  p: LatLng;
  name: string;
  status: string | null;
  vulnerable?: string[];
  risk?: number;
  sub?: string;
}
export interface TicketMarker {
  id: number;
  p: LatLng;
  ref: string;
  label: string;
  status: string;
  name: string;
}

