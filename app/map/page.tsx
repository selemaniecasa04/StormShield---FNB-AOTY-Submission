"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, Layers3, Pause, Play, RotateCcw, X } from "lucide-react";
import { StormMap, DEFAULT_LAYERS, type Basemap, type Layers } from "@/components/map";
import { closuresAt, floodedPlaces, zonesAt } from "@/components/map/model";
import { AddressSearch, Legend } from "@/components/panels";
import RiskCard, { FactorBars } from "@/components/RiskCard";
import { Logo, Sparkline } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { useSession } from "@/hooks/useSession";
import type { StatusResponse } from "@/lib/types";
import { ZONE_BY_ID, type LatLng } from "@/lib/geo";
import { LEVEL_META, levelOf, rank, type Level } from "@/lib/risk";
import { HORIZON } from "@/lib/engine";
import { clock, drillClock } from "@/lib/format";

const GROUPS: { title: string; items: [keyof Layers, string][] }[] = [
  { title: "Risk", items: [["zones", "Danger zones"], ["labels", "Area names"]] },
  { title: "Water", items: [["flood", "Flood simulation"], ["flow", "Flood progression paths"], ["gauges", "Water level markers"]] },
  { title: "Weather", items: [["storm", "Storm direction"]] },
  { title: "Response", items: [["evac", "Evacuation corridors"], ["closures", "Road closures"], ["shelter", "Emergency shelters"], ["hospital", "Hospitals"], ["police", "Police stations"], ["fire", "Fire stations"], ["hall", "Community halls"]] },
  { title: "Community", items: [["reports", "Community reports"]] },
];

function FullMap() {
  const params = useSearchParams();
  const { data } = usePoll<StatusResponse>("/api/status", 15000);
  const { user } = useSession();
  const [layers, setLayers] = useState<Layers>({ ...DEFAULT_LAYERS });
  const [now, setNow] = useState<number | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [offset, setOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ p: LatLng; zoom?: number; key?: number } | null>(null);
  const [searched, setSearched] = useState<{ p: LatLng; label: string } | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    if (lat && lng) setFocus({ p: [lat, lng], zoom: 13, key: 1 });
  }, [params]);
  useEffect(() => {
    if (window.innerWidth < 768) setPanel(false);
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Timeline playback: 12 forecast hours in ~12 seconds.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setOffset((o) => {
        const n = o + dt;
        if (n >= HORIZON) {
          setPlaying(false);
          return HORIZON;
        }
        return n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing]);

  const snap = data?.snap ?? null;
  const zs = useMemo(() => (snap ? zonesAt(snap, offset) : {}), [snap, offset]);
  const counts = useMemo(() => {
    const c: Record<Level, number> = { green: 0, yellow: 0, orange: 0, red: 0 };
    Object.values(zs).forEach((z) => c[z.level]++);
    return c;
  }, [zs]);
  const closed = useMemo(() => (snap ? closuresAt(snap, offset).filter((c) => c.closed).length : 0), [snap, offset]);
  const shut = useMemo(() => Object.values(floodedPlaces(snap, offset)).filter(Boolean).length, [snap, offset]);
  const strip = useMemo(() => {
    if (!snap) return [];
    return Array.from({ length: HORIZON + 1 }, (_, k) => {
      const worst = Math.max(...snap.zones.map((z) => z.forecast[k] ?? 0));
      return levelOf(worst);
    });
  }, [snap]);

  const selZone = selected && snap ? snap.zones.find((z) => z.id === selected) ?? null : null;
  const userPlaces = user && user.role === "user" ? [{ p: user.home, label: "Home", kind: "home" as const }] : [];
  const places = searched ? [...userPlaces, { p: searched.p, label: searched.label, kind: "gps" as const }] : userPlaces;
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const hour = data?.event.hour ?? null;

  return (
    <div className="fixed inset-0 bg-bg">
      <StormMap
        snap={snap}
        offset={offset}
        layers={layers}
        basemap={basemap}
        onZoneClick={(id) => setSelected(id)}
        selectedZone={selected}
        focus={focus}
        places={places}
        reports={data?.reports}
        distanceFrom={searched?.p ?? user?.home ?? null}
      />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-wrap items-start gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line2 bg-bg/90 p-1.5 pr-3 shadow-xl backdrop-blur">
          <Link href={user ? (user.role === "admin" ? "/admin" : "/dashboard") : "/"} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <Logo size={24} />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Flood map</div>
            <div className="text-[10px] text-mute">
              {data?.event.mode === "drill" ? (
                <span className="text-violet">DRILL · {drillClock(hour)} · simulated</span>
              ) : (
                "Live · Open-Meteo"
              )}
            </div>
          </div>
        </div>
        <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-line2 bg-bg/90 p-1.5 shadow-xl backdrop-blur sm:w-auto sm:flex-1">
          <AddressSearch
            onPick={(r) => {
              setSearched({ p: r.p, label: r.gps ? "You are here" : r.label.split(",")[0] });
              setFocus({ p: r.p, zoom: 14, key: Date.now() });
            }}
          />
        </div>
        <button onClick={() => setPanel((p) => !p)} className="pointer-events-auto ml-auto flex items-center gap-1.5 rounded-xl border border-line2 bg-bg/90 px-3 py-2.5 text-sm font-semibold shadow-xl backdrop-blur hover:bg-panel">
          <Layers3 size={16} /> Layers
        </button>
      </div>

      {/* Layer panel */}
      {panel && (
        <div className="rise absolute right-3 top-[68px] z-[1000] max-h-[calc(100dvh-230px)] w-64 overflow-y-auto rounded-2xl border border-line2 bg-bg/95 p-3 shadow-2xl backdrop-blur thin-scroll max-sm:top-[120px]">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Map layers</span>
            <button onClick={() => setPanel(false)} className="text-dim hover:text-fg" aria-label="Close layers">
              <X size={16} />
            </button>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-1">
            {(["dark", "streets", "satellite"] as Basemap[]).map((b) => (
              <button key={b} onClick={() => setBasemap(b)} className={`rounded-md py-1 text-xs font-semibold capitalize ${basemap === b ? "bg-white/10 text-fg" : "text-mute hover:text-fg"}`}>
                {b}
              </button>
            ))}
          </div>
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-2">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-dim">{g.title}</div>
              {g.items.map(([k, label]) => (
                <label key={k} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-white/5">
                  <span className="text-fg/85">{label}</span>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${layers[k] ? "bg-brand" : "bg-white/10"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${layers[k] ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                  <input type="checkbox" className="sr-only" checked={layers[k]} onChange={() => toggle(k)} />
                </label>
              ))}
            </div>
          ))}
          <details className="mt-1">
            <summary className="cursor-pointer list-none text-xs font-semibold text-brand">
              Legend <ChevronDown size={12} className="inline" />
            </summary>
            <div className="mt-2">
              <Legend extended collapsible={false} counts={counts} />
            </div>
          </details>
        </div>
      )}

      {/* Legend (desktop) */}
      <div className="absolute bottom-[132px] left-3 z-[1000] hidden w-60 md:block">
        <Legend extended defaultOpen={false} counts={counts} />
      </div>

      {/* Zone details */}
      {selZone && (
        <div className="rise absolute left-3 top-[68px] z-[1001] w-[min(360px,calc(100vw-24px))] max-sm:top-[120px]">
          <button onClick={() => setSelected(null)} className="absolute right-2 top-2 z-10 rounded-lg bg-black/40 p-1 text-mute hover:text-fg" aria-label="Close">
            <X size={16} />
          </button>
          <RiskCard zone={selZone} place={ZONE_BY_ID[selZone.id].name} compact showFactors={false} />
          <div className="panel mt-2 p-4">
            <div className="label mb-1">Forecast · next 12 h</div>
            <Sparkline values={selZone.forecast} height={50} marker={offset} />
            <div className="mb-3 mt-1 flex justify-between font-mono text-[10px] text-dim">
              <span>now</span>
              <span>+6 h</span>
              <span>+12 h</span>
            </div>
            <div className="label mb-2">What drives the score</div>
            <FactorBars z={selZone} />
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="absolute inset-x-3 bottom-3 z-[1000] mx-auto max-w-3xl rounded-2xl border border-line2 bg-bg/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (offset >= HORIZON) setOffset(0);
              setPlaying((p) => !p);
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-[#04121b] transition hover:brightness-110"
            aria-label={playing ? "Pause flood simulation" : "Play flood simulation"}
          >
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-semibold">
                {offset < 0.05 ? "Now" : `+${offset.toFixed(1)} h`} {now && <span className="font-normal text-mute">· {clock(new Date(now + offset * 3_600_000))}</span>}
              </div>
              <div className="hidden gap-3 text-[11px] sm:flex">
                <span style={{ color: LEVEL_META.red.color }}>{counts.red} extreme</span>
                <span style={{ color: LEVEL_META.orange.color }}>{counts.orange} high</span>
                <span className="text-red-300">{closed} roads closed</span>
                <span className="text-mute">{shut} shelters cut off</span>
              </div>
            </div>
            <div className="relative mt-2">
              <div className="mb-1 flex h-1.5 overflow-hidden rounded-full">
                {strip.map((l, i) => (
                  <div key={i} className="flex-1" style={{ background: LEVEL_META[l].color, opacity: 0.85 }} title={`+${i} h`} />
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={HORIZON}
                step={0.25}
                value={offset}
                onChange={(e) => {
                  setPlaying(false);
                  setOffset(Number(e.target.value));
                }}
                className="w-full accent-[#3cc7f5]"
                aria-label="Forecast time"
              />
              <div className="flex justify-between font-mono text-[10px] text-dim">
                {[0, 3, 6, 9, 12].map((h) => (
                  <button key={h} onClick={() => { setPlaying(false); setOffset(h); }} className="hover:text-fg">
                    {h === 0 ? "now" : `+${h}h`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {offset > 0 && (
            <button onClick={() => { setPlaying(false); setOffset(0); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mute hover:bg-white/5 hover:text-fg" aria-label="Back to now">
              <RotateCcw size={16} />
            </button>
          )}
        </div>
        {snap && !snap.ok && <div className="mt-2 text-center text-xs text-danger">NO LIVE DATA. Map shows areas only.</div>}
        {snap && rank(snap.city.level) >= 2 && offset === 0 && (
          <div className="mt-1 text-center text-[11px] text-mute">Press play to watch the flood forecast unfold over the next 12 hours.</div>
        )}
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <FullMap />
    </Suspense>
  );
}
