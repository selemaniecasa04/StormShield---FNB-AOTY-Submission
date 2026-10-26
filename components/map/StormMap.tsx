"use client";
import { Fragment, useEffect, useMemo, useRef } from "react";
import { UNIT_TYPES, type UnitRow } from "@/lib/dispatch";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Pane, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { CITY, EVAC_ROUTES, PLACES, PLACE_LABEL, RIVERS, ZONES, distanceKm, travelEstimate, type LatLng, type PlaceType } from "@/lib/geo";
import { LEVEL_META, CHECK_META, REPORT_KINDS, rank, type CheckStatus, type Level } from "@/lib/risk";
import type { Snapshot } from "@/lib/engine";
import type { ReportRow } from "@/lib/types";
import { closuresAt, floodRibbons, floodedPlaces, gaugesAt, stormAt, zonesAt } from "./model";
import { km, timeAgo } from "@/lib/format";

import type { Basemap, Layers, PersonMarker, TicketMarker } from "./layers";
import { DEFAULT_LAYERS } from "./layers";

export interface StormMapProps {
  snap: Snapshot | null;
  offset?: number;
  layers?: Partial<Layers>;
  basemap?: Basemap;
  places?: { p: LatLng; label: string; kind: "home" | "work" | "gps" }[];
  focus?: { p: LatLng; zoom?: number; key?: string | number } | null;
  selectedZone?: string | null;
  onZoneClick?: (id: string) => void;
  onMapClick?: (p: LatLng) => void;
  pick?: LatLng | null;
  reports?: ReportRow[];
  people?: PersonMarker[];
  tickets?: TicketMarker[];
  units?: UnitRow[];
  onUnitClick?: (id: string) => void;
  interactive?: boolean;
  zoomControl?: boolean;
  initialZoom?: number;
  initialCenter?: LatLng;
  distanceFrom?: LatLng | null;
}

const TILES: Record<Basemap, { url: string; attr: string; sub?: string }> = {
  dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>', sub: "abcd" },
  streets: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imagery &copy; Esri, Maxar, Earthstar Geographics" },
};

const PLACE_STYLE: Record<PlaceType, { bg: string; path: string }> = {
  shelter: { bg: "#16a34a", path: "M3 11 12 4l9 7v9h-6v-6H9v6H3z" },
  police: { bg: "#2563eb", path: "M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" },
  hospital: { bg: "#dc2626", path: "M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" },
  fire: { bg: "#ea580c", path: "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" },
  hall: { bg: "#0d9488", path: "M3 9 12 4l9 5v2H3zM5 12h2v6H5zm4 0h2v6H9zm4 0h2v6h-2zm4 0h2v6h-2zM3 19h18v2H3z" },
};

const iconCache = new Map<string, L.DivIcon>();
function icon(key: string, html: string, size = 26) {
  const k = key + size;
  let i = iconCache.get(k);
  if (!i) {
    i = L.divIcon({ html, className: "ss-icon", iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
    iconCache.set(k, i);
  }
  return i;
}

function placeIcon(type: PlaceType, closed: boolean) {
  const s = PLACE_STYLE[type];
  return icon(
    `pl-${type}-${closed}`,
    `<div style="width:26px;height:26px;border-radius:8px;background:${closed ? "#3b4652" : s.bg};display:grid;place-items:center;border:2px solid ${closed ? "#ef4444" : "rgba(255,255,255,.85)"};box-shadow:0 2px 8px rgba(0,0,0,.5)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff">${closed && type === "shelter" ? '<path d="M6 6l12 12M18 6 6 18" stroke="#fff" stroke-width="3"/>' : `<path d="${s.path}"/>`}</svg></div>`,
  );
}

const meIcon = (kind: "home" | "work" | "gps") =>
  icon(
    `me-${kind}`,
    `<div style="position:relative;width:30px;height:30px">
      <span class="pulse-ring" style="position:absolute;inset:0;border-radius:50%;background:${kind === "gps" ? "#3cc7f5" : "#e7eef5"};opacity:.5"></span>
      <div style="position:absolute;inset:5px;border-radius:50%;background:${kind === "gps" ? "#3cc7f5" : "#0b1117"};border:3px solid ${kind === "gps" ? "#fff" : "#3cc7f5"};display:grid;place-items:center">
        ${kind === "home" ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="#3cc7f5"><path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/></svg>' : kind === "work" ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="#3cc7f5"><path d="M9 4h6v3h5v13H4V7h5zm2 0v3h2V4z"/></svg>' : ""}
      </div></div>`,
    30,
  );

const closureIcon = icon(
  "closure",
  `<div style="width:22px;height:22px;border-radius:50%;background:#ef4444;border:2px solid #fff;display:grid;place-items:center;box-shadow:0 0 12px rgba(239,68,68,.7)"><div style="width:11px;height:3px;background:#fff;border-radius:2px"></div></div>`,
  22,
);

const reportIcon = icon(
  "report",
  `<div style="width:22px;height:22px;display:grid;place-items:center"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2 1.5 21h21z" fill="#facc15" stroke="#0b1117" stroke-width="1.2"/><path d="M12 9v5" stroke="#0b1117" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.3" fill="#0b1117"/></svg></div>`,
  22,
);

function gaugeIcon(level: number, warn: number, danger: number, top: number) {
  const pct = Math.max(0.04, Math.min(1, level / top));
  const c = level >= danger ? "#ef4444" : level >= warn ? "#f97316" : "#38bdf8";
  const key = `g-${Math.round(level * 10)}-${c}`;
  return icon(
    key,
    `<div style="display:flex;align-items:flex-end;gap:4px;transform:translate(9px,-4px)">
      <div style="width:9px;height:30px;border-radius:3px;background:#0b1117;border:1px solid #3b4d5e;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;right:0;bottom:0;height:${pct * 100}%;background:${c}"></div>
        <div style="position:absolute;left:0;right:0;bottom:${(warn / top) * 100}%;height:1px;background:#f97316"></div>
        <div style="position:absolute;left:0;right:0;bottom:${(danger / top) * 100}%;height:1px;background:#ef4444"></div>
      </div>
      <div style="font:600 10px/1 var(--font-mono),monospace;color:${c};background:rgba(11,17,23,.85);padding:2px 4px;border-radius:4px;white-space:nowrap">${level.toFixed(1)} m</div>
    </div>`,
    30,
  );
}

function stormArrow(heading: number) {
  return icon(
    `storm-${heading}`,
    `<div style="transform:rotate(${heading}deg);width:34px;height:34px;display:grid;place-items:center"><svg width="34" height="34" viewBox="0 0 24 24"><path d="M12 2 19 13h-4.5v9h-5v-9H5z" fill="#a5b4fc" stroke="#1e1b4b" stroke-width=".8"/></svg></div>`,
    34,
  );
}

function FocusController({ focus }: { focus: StormMapProps["focus"] }) {
  const map = useMap();
  const last = useRef<string>("");
  useEffect(() => {
    if (!focus) return;
    const k = `${focus.p[0]},${focus.p[1]},${focus.zoom},${focus.key ?? ""}`;
    if (k === last.current) return;
    last.current = k;
    map.flyTo(focus.p, focus.zoom ?? 14, { duration: 1.1 });
  }, [focus, map]);
  return null;
}

function ClickHandler({ onClick }: { onClick?: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick?.([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function Resize() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

const PERSON_COLOR = (s: string | null) => (s ? CHECK_META[s as CheckStatus]?.color ?? "#8b9db0" : "#8b9db0");

export default function StormMap(props: StormMapProps) {
  const {
    snap, offset = 0, basemap = "dark", places = [], focus, selectedZone, onZoneClick, onMapClick, pick, reports = [], people, tickets, units, onUnitClick,
    interactive = true, zoomControl = true, initialZoom = CITY.zoom, initialCenter = CITY.center, distanceFrom,
  } = props;
  const L_ = { ...DEFAULT_LAYERS, ...props.layers };
  const tiles = TILES[basemap];

  const zstate = useMemo(() => (snap ? zonesAt(snap, offset) : {}), [snap, offset]);
  const ribbons = useMemo(() => (snap && L_.flood ? floodRibbons(snap, offset) : []), [snap, offset, L_.flood]);
  const closures = useMemo(() => (snap ? closuresAt(snap, offset) : []), [snap, offset]);
  const gauges = useMemo(() => (snap ? gaugesAt(snap, offset) : []), [snap, offset]);
  const storm = useMemo(() => (snap ? stormAt(snap, offset) : null), [snap, offset]);
  const placeStatus = useMemo(() => floodedPlaces(snap, offset), [snap, offset]);

  const live = !!snap?.ok;

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      minZoom={8}
      maxZoom={18}
      zoomControl={false}
      attributionControl
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      boxZoom={interactive}
      keyboard={interactive}
      className="h-full w-full"
      preferCanvas={false}
    >
      <TileLayer key={basemap} url={tiles.url} attribution={tiles.attr} subdomains={tiles.sub ?? "abc"} detectRetina />
      {zoomControl && interactive && <ZoomCtl />}
      <Resize />
      <FocusController focus={focus} />
      <ClickHandler onClick={onMapClick} />

      <Pane name="zones" style={{ zIndex: 405 }}>
        {L_.zones &&
          ZONES.map((z) => {
            const st = zstate[z.id];
            const level: Level = live && st ? st.level : "green";
            const m = LEVEL_META[level];
            const sel = selectedZone === z.id;
            const noData = !live;
            return (
              <Polygon
                key={`${z.id}-${level}-${sel}`}
                positions={z.poly}
                pathOptions={{
                  color: sel ? "#ffffff" : noData ? "#4b5a69" : m.color,
                  weight: sel ? 3 : 1.2,
                  opacity: sel ? 1 : 0.75,
                  fillColor: noData ? "#3b4652" : m.color,
                  fillOpacity: noData ? 0.08 : level === "red" ? 0.3 : level === "orange" ? 0.24 : level === "yellow" ? 0.18 : 0.1,
                  className: level === "red" && !sel ? "zone-red" : undefined,
                }}
                eventHandlers={onZoneClick ? { click: (e) => { L.DomEvent.stopPropagation(e); onZoneClick(z.id); } } : undefined}
                bubblingMouseEvents={false}
              >
                {L_.labels && (
                  <Tooltip permanent direction="center" className="zone-label" opacity={1}>
                    {z.name}
                  </Tooltip>
                )}
                {!L_.labels && interactive && (
                  <Tooltip sticky>
                    {z.name} · {noData ? "No live data" : `${m.label} (${Math.round(st?.score ?? 0)})`}
                  </Tooltip>
                )}
              </Polygon>
            );
          })}
      </Pane>

      <Pane name="flood" style={{ zIndex: 420 }}>
        {ribbons.map((r) => (
          <Polygon key={`fo-${r.id}`} positions={r.outer} pathOptions={{ color: "#38bdf8", weight: 1, opacity: 0.6, fillColor: "#38bdf8", fillOpacity: 0.32 }} interactive={interactive}>
            {interactive && (
              <Tooltip sticky>
                Flood extent · {r.name} · stage {Math.round(r.stage * 100)}%
              </Tooltip>
            )}
          </Polygon>
        ))}
        {ribbons.map((r) => r.inner && <Polygon key={`fi-${r.id}`} positions={r.inner} pathOptions={{ stroke: false, fillColor: "#1d4ed8", fillOpacity: 0.55 }} interactive={false} />)}
        {L_.flow &&
          RIVERS.map((r) => {
            const st = snap ? snap.rivers[r.id]?.[3 + Math.round(offset)] ?? 0 : 0;
            return (
              <Polyline
                key={`fl-${r.id}-${st > 0.5}`}
                positions={r.line}
                pathOptions={{ color: st > 0.5 ? "#e0f2fe" : "#7dd3fc", weight: 2 + st * 3, opacity: 0.9, className: "flow-path", lineCap: "round" }}
                interactive={false}
              />
            );
          })}
      </Pane>

      <Pane name="routes" style={{ zIndex: 430 }}>
        {L_.evac &&
          EVAC_ROUTES.map((r) => {
            const lvl = zstate[r.from]?.level ?? "green";
            const hot = live && rank(lvl) >= 2;
            const dest = PLACES.find((p) => p.id === r.to);
            return (
              <Polyline key={`ev-${r.id}-${hot}`} positions={r.line} pathOptions={{ color: "#4ade80", weight: hot ? 4 : 2.5, opacity: hot ? 0.95 : 0.4, className: "evac-path", lineCap: "round" }}>
                {interactive && (
                  <Popup>
                    <b>Evacuation corridor</b>
                    <br />
                    {r.name}
                    <br />
                    <span style={{ color: "#8b9db0" }}>Destination: {dest?.name}</span>
                  </Popup>
                )}
              </Polyline>
            );
          })}
        {L_.closures &&
          closures
            .filter((c) => c.closed)
            .map((c) => (
              <Polyline key={`rc-${c.id}`} positions={c.line} pathOptions={{ color: "#ef4444", weight: 7, opacity: 0.9, dashArray: "6 5", lineCap: "butt" }} />
            ))}
      </Pane>

      {L_.storm && storm && storm.intensity > 0.05 && (
        <Pane name="storm" style={{ zIndex: 415 }}>
          <Polyline positions={storm.track} pathOptions={{ color: "#a5b4fc", weight: 1.5, opacity: 0.6, dashArray: "3 7" }} interactive={false} />
          {[1, 0.6, 0.3].map((f, i) => (
            <Circle
              key={i}
              center={storm.p}
              radius={storm.radiusKm * 1000 * f}
              pathOptions={{
                stroke: i === 0,
                color: "#a5b4fc",
                weight: 1,
                opacity: 0.45,
                dashArray: "4 6",
                fillColor: i === 2 ? "#c084fc" : "#6366f1",
                fillOpacity: [0.025, 0.05, 0.09][i] * (0.4 + storm.intensity),
              }}
              interactive={false}
            />
          ))}
          <Marker position={storm.p} icon={stormArrow(storm.heading)} interactive={interactive}>
            {interactive && (
              <Popup>
                <b>Storm cell</b>
                <br />
                Moving north-east, about 25 km/h
                <br />
                Intensity {Math.round(storm.intensity * 100)}% · radius {Math.round(storm.radiusKm)} km
              </Popup>
            )}
          </Marker>
        </Pane>
      )}

      {L_.closures &&
        closures
          .filter((c) => c.closed)
          .map((c) => (
            <Marker key={`rcm-${c.id}`} position={[(c.line[0][0] + c.line[1][0]) / 2, (c.line[0][1] + c.line[1][1]) / 2]} icon={closureIcon} interactive={interactive}>
              {interactive && (
                <Popup>
                  <b style={{ color: "#fca5a5" }}>Road closed</b>
                  <br />
                  {c.name}
                  <br />
                  <span style={{ color: "#8b9db0" }}>Closed by flood water. Use another route.</span>
                </Popup>
              )}
            </Marker>
          ))}

      {L_.gauges &&
        gauges
          .filter((g) => g.level !== null)
          .map((g) => (
            <Marker key={`ga-${g.id}`} position={g.p} icon={gaugeIcon(g.level!, g.warn, g.danger, g.base + g.rise)} interactive={interactive}>
              {interactive && (
                <Popup>
                  <b>Water level · {g.name}</b>
                  <br />
                  <span style={{ fontFamily: "var(--font-mono)" }}>{g.level!.toFixed(2)} m</span> (warning {g.warn} m, danger {g.danger} m)
                  <br />
                  <span style={{ color: "#8b9db0" }}>{g.level! >= g.danger ? "Above danger level" : g.level! >= g.warn ? "Above warning level" : "Within normal range"}</span>
                </Popup>
              )}
            </Marker>
          ))}

      {PLACES.filter((p) => L_[p.type]).map((p) => {
        const closed = placeStatus[p.id];
        const d = distanceFrom ? distanceKm(distanceFrom, p.p) : null;
        const t = d !== null ? travelEstimate(d) : null;
        return (
          <Marker key={p.id} position={p.p} icon={placeIcon(p.type, closed)} interactive={interactive}>
            {interactive && (
              <Popup>
                <b>{p.name}</b>
                <br />
                <span style={{ color: "#8b9db0" }}>{PLACE_LABEL[p.type]}</span>
                {p.capacity ? <> · capacity {p.capacity}</> : null}
                {closed && (
                  <>
                    <br />
                    <b style={{ color: "#fca5a5" }}>Closed – cut off by flood water</b>
                  </>
                )}
                {t && (
                  <>
                    <br />
                    {km(t.roadKm)} · ~{t.driveMin} min drive · ~{t.walkMin} min walk
                  </>
                )}
                {p.phone && (
                  <>
                    <br />
                    Call <a href={`tel:${p.phone.replace(/\s/g, "")}`}>{p.phone}</a>
                  </>
                )}
                <br />
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.p[0]},${p.p[1]}`} target="_blank" rel="noreferrer">
                  Directions ↗
                </a>
              </Popup>
            )}
          </Marker>
        );
      })}

      {L_.reports &&
        reports.map((r) => (
          <Marker key={`rp-${r.id}`} position={[r.lat, r.lng]} icon={reportIcon} interactive={interactive}>
            {interactive && (
              <Popup>
                <b>Community report · {REPORT_KINDS[r.kind as keyof typeof REPORT_KINDS] ?? r.kind}</b>
                {r.note && (
                  <>
                    <br />“{r.note}”
                  </>
                )}
                <br />
                <span style={{ color: "#8b9db0" }}>{timeAgo(r.created_at)}</span>
              </Popup>
            )}
          </Marker>
        ))}

      {people?.map((pp) => (
        <CircleMarker
          key={`pp-${pp.id}`}
          center={pp.p}
          radius={pp.status === "need_help" ? 8 : 5.5}
          pathOptions={{ color: pp.vulnerable?.length ? "#a78bfa" : "#0b1117", weight: pp.vulnerable?.length ? 2.5 : 1.5, fillColor: PERSON_COLOR(pp.status), fillOpacity: pp.status ? 0.95 : 0.55 }}
        >
          <Popup>
            <b>{pp.name}</b>
            <br />
            {pp.status ? CHECK_META[pp.status as CheckStatus]?.label : <span style={{ color: "#fbbf24" }}>No response yet</span>}
            {pp.vulnerable?.length ? (
              <>
                <br />
                <span style={{ color: "#c4b5fd" }}>Vulnerable: {pp.vulnerable.join(", ")}</span>
              </>
            ) : null}
            {pp.sub && (
              <>
                <br />
                <span style={{ color: "#8b9db0" }}>{pp.sub}</span>
              </>
            )}
          </Popup>
        </CircleMarker>
      ))}

      {tickets?.map((t) => (
        <Marker
          key={`tk-${t.id}-${t.status}`}
          position={t.p}
          icon={icon(
            `tk-${t.status}`,
            `<div style="position:relative;width:28px;height:28px">${t.status === "resolved" ? "" : '<span class="pulse-ring" style="position:absolute;inset:0;border-radius:50%;background:#ef4444"></span>'}<div style="position:absolute;inset:6px;border-radius:50%;background:${t.status === "resolved" ? "#475569" : "#ef4444"};border:2px solid #fff"></div></div>`,
            28,
          )}
        >
          <Popup>
            <b>{t.ref}</b> · {t.label}
            <br />
            {t.name}
            <br />
            <span style={{ color: "#8b9db0" }}>Status: {t.status.replace("_", " ")}</span>
          </Popup>
        </Marker>
      ))}

      {units?.map((u) => {
        const c = UNIT_TYPES[u.type]?.color ?? "#3cc7f5";
        const moving = u.status !== "available";
        const target = tickets?.find((t) => t.id === u.ticketId)?.p;
        return (
          <Fragment key={`un-${u.id}`}>
            {moving && target && <Polyline positions={[u.p, target]} pathOptions={{ color: c, weight: 2, opacity: 0.8, dashArray: "4 6" }} interactive={false} />}
            <Marker
              position={u.p}
              zIndexOffset={600}
              icon={icon(
                `unit-${u.type}-${u.status}`,
                `<div style="width:24px;height:24px;border-radius:7px;background:${moving ? c : "#0b1117"};border:2px solid ${c};display:grid;place-items:center;box-shadow:0 0 ${moving ? 12 : 0}px ${c}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${moving ? "#fff" : c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></div>`,
                24,
              )}
              eventHandlers={onUnitClick ? { click: () => onUnitClick(u.id) } : undefined}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                {u.name} · {u.status === "available" ? "available" : u.status === "on_scene" ? `on scene ${u.ticketRef}` : `en route to ${u.ticketRef}`}
              </Tooltip>
            </Marker>
          </Fragment>
        );
      })}

      {places.map((pl) => (
        <Marker key={`me-${pl.kind}`} position={pl.p} icon={meIcon(pl.kind)} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -14]} permanent={!interactive ? false : undefined}>
            {pl.label}
          </Tooltip>
        </Marker>
      ))}

      {pick && <Marker position={pick} icon={meIcon("home")} zIndexOffset={1000} />}
    </MapContainer>
  );
}

function ZoomCtl() {
  const map = useMap();
  useEffect(() => {
    const z = L.control.zoom({ position: "bottomright" });
    z.addTo(map);
    return () => {
      z.remove();
    };
  }, [map]);
  return null;
}
