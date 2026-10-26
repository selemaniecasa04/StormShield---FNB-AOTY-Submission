"use client";
import { useEffect, useState } from "react";
import { Check, Clock, Hourglass, ListChecks, Ruler, ShieldAlert } from "lucide-react";
import type { ZoneState } from "@/lib/engine";
import { ACTIONS, LEVEL_META, levelOf, rank } from "@/lib/risk";
import { hoursLabel, inHours, clock } from "@/lib/format";
import { PanelHead } from "../ui";

/** Water depth against a 1.7 m adult and a car, so the number means something. */
function DepthFigure({ depth }: { depth: number }) {
  const H = 120;
  const scale = H / 2.4; // px per metre (shows up to 2.4 m)
  const water = Math.min(H, depth * scale);
  return (
    <svg viewBox={`0 0 120 ${H + 4}`} className="h-[124px] w-[120px] shrink-0" aria-label={`Expected depth ${depth} metres`}>
      {[0.5, 1, 1.5, 2].map((m) => (
        <g key={m}>
          <line x1="0" x2="120" y1={H - m * scale} y2={H - m * scale} stroke="#ffffff" strokeOpacity=".07" />
          <text x="2" y={H - m * scale - 2} fontSize="7" fill="#5f7286" fontFamily="var(--font-mono)">
            {m} m
          </text>
        </g>
      ))}
      {/* car */}
      <g transform={`translate(20 ${H - 0.55 * scale})`} fill="#3b4d5e">
        <path d={`M0 ${0.55 * scale - 6} h36 v-10 l-6 -8 h-20 l-6 8 h-4 z`} />
        <circle cx="8" cy={0.55 * scale - 4} r="4" fill="#1f2a35" />
        <circle cx="28" cy={0.55 * scale - 4} r="4" fill="#1f2a35" />
      </g>
      {/* person 1.7 m */}
      <g transform={`translate(80 ${H - 1.7 * scale})`} fill="#8b9db0">
        <circle cx="8" cy="5.5" r="5" />
        <rect x="3" y="12" width="10" height={0.75 * scale} rx="3" />
        <rect x="3" y={10 + 0.75 * scale} width="4" height={0.95 * scale - 10} rx="2" />
        <rect x="9" y={10 + 0.75 * scale} width="4" height={0.95 * scale - 10} rx="2" />
      </g>
      <rect x="0" y={H - water} width="120" height={water} fill="#38bdf8" fillOpacity=".38" style={{ transition: "all .8s" }} />
      <line x1="0" x2="120" y1={H - water} y2={H - water} stroke="#7dd3fc" strokeWidth="1.5" style={{ transition: "all .8s" }} />
      <line x1="0" x2="120" y1={H} y2={H} stroke="#5f7286" />
    </svg>
  );
}

export default function Impact({ zone, eventId, place }: { zone: ZoneState | null; eventId: number; place: string }) {
  const upcoming = zone ? levelOf(Math.max(zone.score, zone.forecast[2] ?? 0)) : "green";
  const act = ACTIONS[upcoming];
  const key = `ss-kit-${eventId}-${upcoming}`;
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      setDone([]);
    }
  }, [key]);
  const toggle = (i: number) => {
    const n = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    setDone(n);
    try {
      localStorage.setItem(key, JSON.stringify(n));
    } catch {
      /* storage unavailable */
    }
  };
  if (!zone) {
    return (
      <div className="panel p-5">
        <PanelHead icon={<ShieldAlert size={13} />} title="Weather impact" />
        <p className="text-sm text-mute">No forecast is available for {place} yet.</p>
      </div>
    );
  }
  const m = LEVEL_META[zone.level];
  const arrival =
    rank(zone.level) >= 2
      ? { v: "Now", s: zone.peakIn > 0.1 ? `peaks ${inHours(zone.peakIn)}` : "at peak" }
      : zone.orangeIn !== null
        ? { v: inHours(zone.orangeIn).replace("in ", ""), s: `around ${clock(new Date(Date.now() + zone.orangeIn * 3_600_000))}` }
        : { v: "Not expected", s: "next 12 h" };
  const urgent = upcoming === "red";
  return (
    <div className="panel p-5">
      <PanelHead icon={<ShieldAlert size={13} />} title="Weather impact" sub={place} />
      <div className="flex gap-4">
        <DepthFigure depth={zone.depthM} />
        <div className="grid flex-1 grid-cols-2 gap-2 self-start">
          <Cell icon={Ruler} label="Expected flood depth" value={zone.depthM > 0 ? `${zone.depthM} m` : "< 0.1 m"} sub={zone.depthM >= 0.6 ? "cars can float" : zone.depthM >= 0.3 ? "knee-deep, fast water" : "surface water"} />
          <Cell label="Risk category" value={zone.category.replace(" RISK", "")} color={m.color} sub={`score ${zone.score}`} />
          <Cell icon={Clock} label="Expected arrival" value={arrival.v} sub={arrival.s} />
          <Cell icon={Hourglass} label="Duration" value={zone.durationH > 0 ? hoursLabel(zone.durationH) : "—"} sub="at high risk or above" />
        </div>
      </div>
      <div className={`mt-4 rounded-xl border p-3 ${urgent ? "border-danger/60 bg-danger/10" : "border-line2 bg-black/20"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="label flex items-center gap-1.5">
            <ListChecks size={13} /> Recommended action
          </div>
          <span className="font-mono text-[11px] text-dim">
            {done.length}/{act.steps.length} done
          </span>
        </div>
        <div className={`mt-1 text-lg font-bold ${urgent ? "text-red-300" : ""}`}>{act.headline}</div>
        <ul className="mt-2 space-y-1.5">
          {act.steps.map((s, i) => (
            <li key={s}>
              <button onClick={() => toggle(i)} className="flex w-full items-start gap-2.5 text-left text-sm">
                <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition ${done.includes(i) ? "border-safe bg-safe text-[#05210f]" : "border-line2"}`}>
                  {done.includes(i) && <Check size={12} strokeWidth={3.5} />}
                </span>
                <span className={done.includes(i) ? "text-dim line-through" : "text-fg/90"}>{s}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Cell({ icon: Icon, label, value, sub, color }: { icon?: React.ComponentType<{ size?: number }>; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-line bg-black/20 p-2.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
        {Icon && <Icon size={11} />}
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-bold tabular" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-dim">{sub}</div>}
    </div>
  );
}
