"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BellRing, Expand, Languages, Layers3, ShieldCheck, Users, X } from "lucide-react";
import { StormMap, DEFAULT_LAYERS } from "@/components/map";
import RiskCard from "@/components/RiskCard";
import { AddressSearch, AlertList, EventBanner, Legend, WeatherCard, ZoneRanking } from "@/components/panels";
import { PanelHead } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { useSession } from "@/hooks/useSession";
import type { StatusResponse } from "@/lib/types";
import { CITY, ZONE_BY_ID, zoneAt, type LatLng } from "@/lib/geo";
import { LEVEL_META, categoryOf } from "@/lib/risk";

const HORIZONS = [0, 3, 6, 12];

export default function Home() {
  const { data } = usePoll<StatusResponse>("/api/status", 15000);
  const { user } = useSession();
  const [located, setLocated] = useState<{ label: string; p: LatLng; gps?: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [focus, setFocus] = useState<{ p: LatLng; zoom?: number; key?: number } | null>(null);
  const [quick, setQuick] = useState({ flood: true, evac: true, shelter: true });

  useEffect(() => {
    if (user && !located) {
      setLocated({ label: "Your home", p: user.home });
      setFocus({ p: user.home, zoom: 13, key: Date.now() });
    }
  }, [user, located]);

  const snap = data?.snap;
  const locatedZone = located ? zoneAt(located.p) : null;
  const zoneState = (id: string | null | undefined) => (id && snap ? snap.zones.find((z) => z.id === id) ?? null : null);
  const shown = selected ? zoneState(selected) : locatedZone ? zoneState(locatedZone.id) : null;
  const worst = snap?.city.worst ? zoneState(snap.city.worst) : null;

  const pick = (r: { label: string; p: LatLng; gps?: boolean }) => {
    setLocated(r);
    setSelected(null);
    setFocus({ p: r.p, zoom: 14, key: Date.now() });
  };
  const selectZone = (id: string) => {
    setSelected(id);
    setFocus({ p: ZONE_BY_ID[id].c, zoom: 13, key: Date.now() });
  };

  const layers = useMemo(() => ({ ...DEFAULT_LAYERS, flood: quick.flood, flow: quick.flood, evac: quick.evac, shelter: quick.shelter, hospital: quick.shelter }), [quick]);
  const outside = located && !locatedZone;

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col">
      <EventBanner event={data?.event} snap={snap} />
      <main className="mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-1 gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
        {/* Map */}
        <section className="relative h-[58dvh] overflow-hidden rounded-2xl border border-line lg:h-[calc(100dvh-56px-36px-32px)] lg:min-h-[560px]">
          <StormMap
            snap={snap ?? null}
            offset={offset}
            layers={layers}
            onZoneClick={selectZone}
            selectedZone={selected}
            focus={focus}
            places={located ? [{ p: located.p, label: located.gps ? "You are here" : located.label, kind: located.gps ? "gps" : "home" }] : []}
            reports={data?.reports}
            distanceFrom={located?.p ?? null}
          />
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="pointer-events-auto w-full max-w-md rounded-xl border border-line2 bg-bg/90 p-2 shadow-xl backdrop-blur">
              <AddressSearch onPick={pick} placeholder="Find your area: address or suburb" />
            </div>
            <div className="pointer-events-auto flex items-center gap-1 self-start rounded-xl border border-line2 bg-bg/90 p-1 shadow-xl backdrop-blur sm:ml-auto">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setOffset(h)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${offset === h ? "bg-brand text-[#04121b]" : "text-mute hover:text-fg"}`}
                >
                  {h === 0 ? "Now" : `+${h} h`}
                </button>
              ))}
              <Link href="/map" className="ml-1 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-fg hover:bg-white/5" title="Open full-screen map">
                <Expand size={14} /> <span className="hidden sm:inline">Full map</span>
              </Link>
            </div>
          </div>
          <div className="absolute bottom-3 left-3 z-[1000] hidden max-w-[240px] sm:block">
            <Legend counts={snap?.city.counts} defaultOpen />
          </div>
          <div className="absolute bottom-3 right-14 z-[1000] flex gap-1 rounded-xl border border-line2 bg-bg/90 p-1 text-xs shadow-xl backdrop-blur">
            <Layers3 size={14} className="m-1.5 text-dim" />
            {(
              [
                ["flood", "Flood"],
                ["evac", "Evacuation"],
                ["shelter", "Shelters"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setQuick((q) => ({ ...q, [k]: !q[k] }))}
                className={`rounded-lg px-2 py-1 font-medium transition ${quick[k] ? "bg-white/10 text-fg" : "text-dim hover:text-fg"}`}
                aria-pressed={quick[k]}
              >
                {label}
              </button>
            ))}
          </div>
          {offset > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-[86px] z-[1000] -translate-x-1/2 rounded-full border border-brand/40 bg-bg/90 px-3 py-1 text-xs font-semibold text-brand shadow-lg sm:top-16">
              Forecast view: +{offset} h
            </div>
          )}
        </section>

        {/* Side panel */}
        <aside className="space-y-4 lg:max-h-[calc(100dvh-56px-36px-32px)] lg:overflow-y-auto lg:pr-1 thin-scroll">
          {shown ? (
            <div className="relative">
              {selected && (
                <button onClick={() => setSelected(null)} className="absolute right-3 top-3 z-10 rounded-lg bg-black/30 p-1 text-mute hover:text-fg" aria-label="Close area details">
                  <X size={16} />
                </button>
              )}
              <RiskCard zone={shown} place={selected ? ZONE_BY_ID[selected].name : `${located?.label ?? ""}${locatedZone && located?.label !== locatedZone.name ? ` · ${locatedZone.name}` : ""}`} noData={snap?.ok === false} />
            </div>
          ) : (
            <div className="panel relative overflow-hidden p-5">
              {worst && <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: LEVEL_META[worst.level].color, opacity: 0.16 }} />}
              <div className="relative">
                <div className="label">Current risk · {CITY.name}</div>
                {snap?.ok === false ? (
                  <div className="mt-3 text-3xl font-extrabold text-mute">NO LIVE DATA</div>
                ) : worst ? (
                  <>
                    <div className="mt-2 text-[34px] font-extrabold leading-none tracking-tight" style={{ color: LEVEL_META[worst.level].color }}>
                      {categoryOf(worst.score)}
                    </div>
                    <p className="mt-2 text-sm text-fg/85">
                      Highest in <b>{worst.name}</b>.{" "}
                      {snap!.city.counts.red > 0 ? `${snap!.city.counts.red} area${snap!.city.counts.red > 1 ? "s" : ""} need immediate action.` : "No areas need evacuation right now."}
                    </p>
                  </>
                ) : (
                  <div className="mt-3 h-10 w-48 animate-pulse rounded bg-white/5" />
                )}
                {snap && snap.ok && (
                  <div className="mt-4 grid grid-cols-4 gap-1.5">
                    {(["red", "orange", "yellow", "green"] as const).map((l) => (
                      <div key={l} className="rounded-lg border border-line bg-black/20 py-2 text-center">
                        <div className="text-lg font-bold tabular" style={{ color: LEVEL_META[l].color }}>
                          {snap.city.counts[l]}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-dim">{l === "red" ? "Extreme" : l === "orange" ? "High" : l === "yellow" ? "Watch" : "Clear"}</div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-mute">Search your address or tap an area on the map to see its risk and forecast.</p>
              </div>
            </div>
          )}
          {outside && (
            <div className="rounded-xl border border-watch/40 bg-watch/10 p-3 text-xs text-fg/85">
              That location is outside the {CITY.name} demo area, so we&apos;re showing city-wide conditions. Live mode covers any location.
            </div>
          )}

          {snap && <WeatherCard w={snap.weather} />}

          <div className="panel p-5">
            <PanelHead icon={<BellRing size={13} />} title="Active alerts" right={<span className="text-xs text-dim">{data?.alerts.length ?? 0} this event</span>} />
            <AlertList alerts={data?.alerts ?? []} onSelect={selectZone} max={5} />
          </div>

          {snap?.ok && (
            <div className="panel p-5">
              <PanelHead title="Highest-risk areas" sub="Ranked by current and forecast risk" />
              <ZoneRanking zones={snap.zones} onSelect={selectZone} selected={selected} />
            </div>
          )}

          {!user && (
            <div className="panel overflow-hidden">
              <div className="bg-gradient-to-br from-brand/20 via-transparent to-transparent p-5">
                <div className="text-lg font-semibold">Get warned before the water arrives</div>
                <ul className="mt-3 space-y-2 text-sm text-fg/85">
                  <li className="flex gap-2">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" /> Alerts for your home and work, by SMS, push and voice call
                  </li>
                  <li className="flex gap-2">
                    <Languages size={16} className="mt-0.5 shrink-0 text-brand" /> In your language, with English underneath: all 11 official languages
                  </li>
                  <li className="flex gap-2">
                    <Users size={16} className="mt-0.5 shrink-0 text-brand" /> See when your family is safe, and call for help in one tap
                  </li>
                </ul>
                <div className="mt-4 flex gap-2">
                  <Link href="/register" className="btn btn-primary flex-1">
                    Create free account <ArrowRight size={16} />
                  </Link>
                  <Link href="/login" className="btn btn-ghost">
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          )}
          {user && (
            <Link href={user.role === "admin" ? "/admin" : user.role === "insurer" ? "/insurer" : "/dashboard"} className="btn btn-primary w-full">
              {user.role === "admin" ? "Open command centre" : user.role === "insurer" ? "Open insurer portal" : "Open my safety dashboard"} <ArrowRight size={16} />
            </Link>
          )}
          <p className="px-1 pb-2 text-[11px] leading-relaxed text-dim">
            StormShield supports, but does not replace, official warnings from the South African Weather Service and your municipality. In an emergency call 112 or 10177.
          </p>
        </aside>
      </main>
    </div>
  );
}
