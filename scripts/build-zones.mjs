// Builds ward-like zone polygons (Voronoi cells clipped to the city boundary).
// Run with: npm run zones   (output is committed, so this only runs when zones change)
import { readFileSync, writeFileSync } from "node:fs";
import { Delaunay } from "d3-delaunay";
import * as turf from "@turf/turf";

const src = JSON.parse(readFileSync(new URL("../lib/data/zones-source.json", import.meta.url)));
const lat0 = -29.88;
const k = Math.cos((lat0 * Math.PI) / 180);
const toXY = ([lat, lng]) => [lng * k, lat];
const toLL = ([x, y]) => [x / k, y]; // returns [lng, lat] for GeoJSON

const pts = src.zones.map((z) => toXY(z.c));
const xs = src.boundary.map((p) => p[1] * k);
const ys = src.boundary.map((p) => p[0]);
const bounds = [Math.min(...xs) - 0.05, Math.min(...ys) - 0.05, Math.max(...xs) + 0.05, Math.max(...ys) + 0.05];
const vor = Delaunay.from(pts).voronoi(bounds);
const ring = src.boundary.map(([lat, lng]) => [lng, lat]);
ring.push(ring[0]);
const boundary = turf.polygon([ring]);

const out = {};
src.zones.forEach((z, i) => {
  const cell = vor.cellPolygon(i).map(toLL);
  const poly = turf.polygon([cell]);
  const clipped = turf.intersect(turf.featureCollection([poly, boundary]));
  if (!clipped) throw new Error("zone outside boundary: " + z.id);
  const g = clipped.geometry;
  const rings = g.type === "Polygon" ? g.coordinates[0] : g.coordinates.sort((a, b) => b[0].length - a[0].length)[0][0];
  out[z.id] = rings.map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]);
});
writeFileSync(new URL("../lib/data/zones-poly.json", import.meta.url), JSON.stringify(out));
console.log("wrote", Object.keys(out).length, "zones");
