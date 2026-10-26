"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CloudRain, Construction, Crosshair, Droplets, Loader2, MapPin, Mountain, Navigation, Search, Thermometer, Wind, Waves } from "lucide-react";
import type { EventInfo, PublicAlert } from "@/lib/types";
import type { Snapshot, WeatherNow, ZoneState } from "@/lib/engine";
import { LEVEL_META, LEVEL_ORDER, type Level } from "@/lib/risk";
import { api, getPosition } from "@/lib/client";
import { drillClock, inHours, timeAgo } from "@/lib/format";
import type { LatLng, Hazard } from "@/lib/geo";
import { LevelDot, LevelPill } from "./ui";

export const HAZARD_ICON: Record<Hazard, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  flood: Waves,
  rain: CloudRain,
  landslide: Mountain,
  wind: Wind,
  road: Construction,
};

export function EventBanner({ event, snap }: { event: EventInfo | undefined; snap: Snapshot | undefined }) {
  if (!event) return <div className="h-9 border-b border-line bg-panel" />;
  const drill = event.mode === "drill";
  return (
    <div className={`border-b ${drill ? "border-violet/30 bg-violet/[.08]" : snap?.ok === false ? "border-danger/30 bg-danger/10" : "border-line bg-panel"}`}>
      <div className="mx-auto flex h-9 max-w-[1500px] items-center gap-3 overflow-hidden px-4 text-xs">
        {drill ? (
          <>
            <span className="flex shrink-0 items-center gap-1.5 rounded bg-violet/20 px-1.5 py-0.5 font-bold uppercase tracking-wider text-violet">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet" /> Drill
            </span>
            <span className="truncate text-fg/85">{event.title}</span>
            <span className="hidden shrink-0 font-mono text-violet sm:inline">{drillClock(event.hour)}</span>
            <span className="ml-auto hidden shrink-0 text-mute md:inline">Simulated scenario. Readings are not real.</span>
            {event.speed > 0 && <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-mute">▶ {event.speed}×</span>}
          </>
        ) : (
          <>
            <span className="flex shrink-0 items-center gap-1.5 rounded bg-safe/15 px-1.5 py-0.5 font-bold uppercase tracking-wider text-safe">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-safe" /> Live
            </span>
            <span className="truncate text-fg/85">{snap?.ok === false ? "No live data. Follow official SAWS warnings." : "Open-Meteo forecasts and GloFAS river flow, refreshed every 10 minutes"}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function WeatherCard({ w, compact = false }: { w: WeatherNow; compact?: boolean }) {
  const max = Math.max(10, ...w.hourlyRain);
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const from = dirs[Math.round(w.windFrom / 45) % 8];
  return (
    <div className="panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="label">Weather overview</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${w.source === "simulated" ? "bg-violet/15 text-violet" : "bg-safe/15 text-safe"}`}>
          {w.source === "simulated" ? "Simulated" : "Open-Meteo"}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{w.condition}</div>
          <div className="text-xs text-mute">Durban · now</div>
        </div>
        <div className="flex items-center gap-1 text-3xl font-light tabular">
          <Thermometer size={20} className="text-dim" />
          {Math.round(w.tempC)}°
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric icon={Droplets} label="Rain now" value={`${w.rainNow} mm/h`} hot={w.rainNow > 15} />
        <Metric icon={CloudRain} label="Next 24 h" value={`${w.rain24} mm`} hot={w.rain24 > 50} />
        <Metric icon={Wind} label={`Gusts · ${from}`} value={`${w.gustKmh} km/h`} hot={w.gustKmh > 60} />
      </div>
      {!compact && w.hourlyRain.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] text-dim">Rainfall, next 12 hours (mm/h)</div>
          <div className="flex h-14 items-end gap-[3px]">
            {w.hourlyRain.map((r, i) => (
              <div key={i} className="group relative flex-1">
                <div
                  className="w-full rounded-t-sm transition-all duration-500"
                  style={{ height: `${Math.max(3, (r / max) * 56)}px`, background: r > 20 ? "#ef4444" : r > 8 ? "#f97316" : r > 2 ? "#38bdf8" : "#1e3a52" }}
                  title={`+${i} h: ${r} mm/h`}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-dim">
            <span>now</span>
            <span>+6 h</span>
            <span>+12 h</span>
          </div>
        </div>
      )}
      {w.actual && (
        <div className="mt-3 rounded-lg border border-line bg-black/20 px-3 py-2 text-[11px] text-mute">
          Actual Durban weather right now: <span className="text-fg/85">{w.actual.condition}, {Math.round(w.actual.tempC)}°, {w.actual.rainNow} mm rain</span> (Open-Meteo)
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, hot }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; hot?: boolean }) {
  return (
    <div className={`rounded-xl border px-2.5 py-2 ${hot ? "border-warn/40 bg-warn/[.07]" : "border-line bg-black/20"}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
        <Icon size={11} />
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular ${hot ? "text-warn" : ""}`}>{value}</div>
    </div>
  );
}

export function AlertList({ alerts, onSelect, max = 8, empty = "No active alerts." }: { alerts: PublicAlert[]; onSelect?: (zoneId: string) => void; max?: number; empty?: string }) {
  if (!alerts.length) return <div className="rounded-xl border border-dashed border-line2 p-4 text-center text-sm text-mute">{empty}</div>;
  return (
    <ul className="space-y-2">
      {alerts.slice(0, max).map((a) => {
        const Icon = HAZARD_ICON[a.hazard];
        const m = LEVEL_META[a.level];
        return (
          <li key={a.id}>
            <button
              onClick={() => a.zoneId && onSelect?.(a.zoneId)}
              className="rise flex w-full gap-3 rounded-xl border border-line bg-black/20 p-3 text-left transition hover:border-line2 hover:bg-white/[.03]"
            >
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: m.soft, color: m.color }}>
                <Icon size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{a.title}</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-mute">{a.body}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <LevelPill level={a.level}>{a.kind === "eased" ? "Easing" : a.kind === "broadcast" ? "Official" : LEVEL_META[a.level].label}</LevelPill>
                  <span className="text-[11px] text-dim">{timeAgo(a.createdAt)}</span>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Legend({ counts, collapsible = true, defaultOpen = true, extended = false }: { counts?: Record<Level, number>; collapsible?: boolean; defaultOpen?: boolean; extended?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line2 bg-bg/90 p-3 text-xs shadow-xl backdrop-blur">
      <button className="label flex w-full items-center justify-between gap-6" onClick={() => collapsible && setOpen((o) => !o)} aria-expanded={open}>
        Map legend {collapsible && <span className="text-dim">{open ? "–" : "+"}</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {[...LEVEL_ORDER].reverse().map((l) => (
            <div key={l} className="flex items-center gap-2">
              <span className="h-3 w-4 rounded-sm" style={{ background: LEVEL_META[l].color, opacity: 0.85 }} />
              <span className="flex-1 text-fg/85">{LEVEL_META[l].mapLabel}</span>
              {counts && <span className="font-mono text-dim">{counts[l]}</span>}
            </div>
          ))}
          <div className="my-2 border-t border-line" />
          <Row swatch={<span className="h-3 w-4 rounded-sm bg-[#38bdf8]/60 ring-1 ring-[#38bdf8]" />} label="Flood extent (shallow)" />
          <Row swatch={<span className="h-3 w-4 rounded-sm bg-[#1d4ed8]" />} label="Deep water > 1 m" />
          <Row swatch={<span className="h-0.5 w-4 border-t-2 border-dotted border-[#7dd3fc]" />} label="Flood flow path" />
          <Row swatch={<span className="h-0.5 w-4 border-t-[3px] border-dashed border-[#4ade80]" />} label="Evacuation corridor" />
          <Row swatch={<span className="h-1.5 w-4 bg-[repeating-linear-gradient(90deg,#ef4444_0_4px,transparent_4px_7px)]" />} label="Road closed" />
          {extended && (
            <>
              <Row swatch={<span className="h-3 w-3 rounded-full bg-[#6366f1]/60 ring-1 ring-[#818cf8]" />} label="Storm cell & track" />
              <Row swatch={<span className="h-3 w-1.5 rounded-sm bg-[#38bdf8] ring-1 ring-slate-500" />} label="River water level gauge" />
              <Row swatch={<Tri />} label="Community report" />
              <Row swatch={<Sq c="#16a34a" />} label="Emergency shelter" />
              <Row swatch={<Sq c="#dc2626" />} label="Hospital" />
              <Row swatch={<Sq c="#2563eb" />} label="Police station" />
              <Row swatch={<Sq c="#ea580c" />} label="Fire station" />
              <Row swatch={<Sq c="#0d9488" />} label="Community hall" />
              <Row swatch={<Sq c="#3b4652" ring="#ef4444" />} label="Shelter closed (in danger zone)" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
const Row = ({ swatch, label }: { swatch: React.ReactNode; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="flex w-4 justify-center">{swatch}</span>
    <span className="text-fg/80">{label}</span>
  </div>
);
const Sq = ({ c, ring = "#fff" }: { c: string; ring?: string }) => <span className="h-3 w-3 rounded-[3px]" style={{ background: c, outline: `1.5px solid ${ring}` }} />;
const Tri = () => (
  <svg width="12" height="12" viewBox="0 0 24 24">
    <path d="M12 2 1.5 21h21z" fill="#facc15" />
  </svg>
);

export function AddressSearch({
  onPick,
  placeholder = "Search an address or suburb…",
  showLocate = true,
  className = "",
  initial = "",
  invalid,
}: {
  onPick: (r: { label: string; p: LatLng; gps?: boolean }) => void;
  placeholder?: string;
  showLocate?: boolean;
  className?: string;
  initial?: string;
  invalid?: boolean;
}) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<{ label: string; p: LatLng; source: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQ(initial);
  }, [initial]);
  useEffect(() => {
    const h = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const search = (v: string) => {
    setQ(v);
    setErr(null);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api<{ results: { label: string; p: LatLng; source: string }[] }>(`/api/geocode?q=${encodeURIComponent(v)}`);
        setResults(r.results);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 280);
  };

  const locate = async () => {
    setLocating(true);
    setErr(null);
    try {
      const pos = await getPosition();
      const r = await api<{ label: string; p: LatLng }>(`/api/geocode?lat=${pos.lat}&lng=${pos.lng}`);
      setQ(r.label);
      onPick({ label: r.label, p: [pos.lat, pos.lng], gps: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            value={q}
            onChange={(e) => search(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                setQ(results[0].label);
                setOpen(false);
                onPick(results[0]);
              }
            }}
            placeholder={placeholder}
            className="input !pl-9 !pr-8"
            aria-label="Search address"
            aria-invalid={invalid}
            autoComplete="off"
          />
          {busy && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-dim" />}
        </div>
        {showLocate && (
          <button type="button" onClick={locate} className="btn btn-ghost shrink-0 !px-3" title="Use my current location" aria-label="Use my current location">
            {locating ? <Loader2 size={17} className="animate-spin" /> : <Crosshair size={17} />}
            <span className="hidden sm:inline">My location</span>
          </button>
        )}
      </div>
      {err && <div className="mt-1 text-xs text-danger">{err}</div>}
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-[1200] mt-1 max-h-72 overflow-y-auto rounded-xl border border-line2 bg-panel py-1 shadow-2xl thin-scroll">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                onClick={() => {
                  setQ(r.label);
                  setOpen(false);
                  onPick(r);
                }}
              >
                <MapPin size={15} className="mt-0.5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">{r.label}</span>
                {r.source === "local" && <span className="text-[10px] uppercase text-dim">area</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ZoneRanking({ zones, onSelect, selected, limit = 6 }: { zones: ZoneState[]; onSelect?: (id: string) => void; selected?: string | null; limit?: number }) {
  const sorted = [...zones].sort((a, b) => Math.max(b.score, b.peakScore * 0.9) - Math.max(a.score, a.peakScore * 0.9)).slice(0, limit);
  return (
    <ul className="divide-y divide-line">
      {sorted.map((z) => (
        <li key={z.id}>
          <button onClick={() => onSelect?.(z.id)} className={`flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-white/[.03] ${selected === z.id ? "bg-white/[.04]" : ""}`}>
            <LevelDot level={z.level} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{z.name}</div>
              <div className="text-[11px] text-dim">
                {z.level === "red"
                  ? `Extreme now · ${z.depthM} m possible`
                  : z.redIn !== null
                    ? `Extreme ${inHours(z.redIn)}`
                    : z.orangeIn !== null && z.level !== "orange"
                      ? `High risk ${inHours(z.orangeIn)}`
                      : z.trend === "falling"
                        ? "Easing"
                        : LEVEL_META[z.level].label}
              </div>
            </div>
            <div className="w-16">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]">
                <div className="h-full rounded-full" style={{ width: `${z.score}%`, background: LEVEL_META[z.level].color }} />
              </div>
            </div>
            <span className="w-7 text-right font-mono text-xs tabular text-mute">{z.score}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NavButton({ p, label }: { p: LatLng; label?: string }) {
  return (
    <a href={`https://www.google.com/maps/dir/?api=1&destination=${p[0]},${p[1]}`} target="_blank" rel="noreferrer" className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
      <Navigation size={13} /> {label ?? "Go"}
    </a>
  );
}

export function AlertIcon() {
  return <AlertTriangle size={14} />;
}
