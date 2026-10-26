"use client";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock, Droplets, Mountain, TrendingUp, Users, Waves } from "lucide-react";
import type { ZoneState } from "@/lib/engine";
import { HAZARD_LABEL, LEVEL_META } from "@/lib/risk";
import { inHours } from "@/lib/format";
import { Sparkline } from "./ui";

export function Gauge({ score, size = 150 }: { score: number; size?: number }) {
  const r = 60;
  const cx = 75;
  const cy = 72;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
  };
  const segs: [number, number, string][] = [
    [0, 0.25, "#22c55e"],
    [0.25, 0.5, "#facc15"],
    [0.5, 0.75, "#f97316"],
    [0.75, 1, "#ef4444"],
  ];
  const a = Math.min(1, Math.max(0, score / 100));
  const nx = cx + (r - 14) * Math.cos(Math.PI * (1 - a));
  const ny = cy - (r - 14) * Math.sin(Math.PI * (1 - a));
  return (
    <svg viewBox="0 0 150 86" width={size} height={(size * 86) / 150} aria-hidden>
      {segs.map(([s, e, c]) => (
        <path key={s} d={arc(s + 0.006, e - 0.006)} stroke={c} strokeWidth="10" fill="none" opacity={a >= s ? 1 : 0.22} strokeLinecap="butt" />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#e7eef5" strokeWidth="3" strokeLinecap="round" style={{ transition: "all .6s" }} />
      <circle cx={cx} cy={cy} r="5" fill="#e7eef5" />
    </svg>
  );
}

export function FactorBars({ z }: { z: ZoneState }) {
  const rows = [
    { k: "Rainfall", v: z.factors.rain, max: 35, icon: Droplets },
    { k: "River level", v: z.factors.river, max: 30, icon: Waves },
    { k: "Soil saturation", v: z.factors.soil, max: 10, icon: TrendingUp },
    { k: "Low-lying terrain", v: z.factors.terrain, max: 10, icon: Mountain },
    { k: "Community reports", v: z.factors.community, max: 12, icon: Users },
  ];
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.k} className="flex items-center gap-2 text-xs">
          <r.icon size={13} className="shrink-0 text-dim" />
          <span className="w-32 shrink-0 text-mute">{r.k}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]">
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.min(100, (r.v / r.max) * 100)}%` }} />
          </div>
          <span className="w-8 text-right font-mono tabular text-fg/80">{Math.round(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function RiskCard({
  zone,
  place,
  noData,
  compact = false,
  showFactors = true,
}: {
  zone: ZoneState | null;
  place: string;
  noData?: boolean;
  compact?: boolean;
  showFactors?: boolean;
}) {
  if (noData || !zone) {
    return (
      <div className="panel p-5">
        <div className="label">Current risk · {place}</div>
        <div className="mt-3 text-3xl font-bold tracking-tight text-mute">NO LIVE DATA</div>
        <p className="mt-2 text-sm text-mute">We can&apos;t reach the weather service right now, so we won&apos;t tell you it&apos;s safe. Follow official SAWS warnings and local radio.</p>
      </div>
    );
  }
  const m = LEVEL_META[zone.level];
  const Trend = zone.trend === "rising" ? ArrowUpRight : zone.trend === "falling" ? ArrowDownRight : ArrowRight;
  const nextEta =
    zone.level === "red"
      ? zone.durationH > 0
        ? { label: "Danger lasts", value: `~${Math.round(zone.durationH)} h` }
        : null
      : zone.redIn !== null
        ? { label: "Extreme danger", value: inHours(zone.redIn) }
        : zone.orangeIn !== null && zone.level !== "orange"
          ? { label: "High risk", value: inHours(zone.orangeIn) }
          : null;
  return (
    <div className="panel relative overflow-hidden p-5" style={{ borderColor: `${m.color}55` }}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: m.color, opacity: 0.18 }} />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="label">Current risk</div>
            <div className="mt-0.5 truncate text-sm text-fg/80">{place}</div>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-line2 px-2 py-0.5 text-[11px] font-semibold capitalize text-mute">
            <Trend size={13} style={{ color: zone.trend === "rising" ? "#f97316" : zone.trend === "falling" ? "#22c55e" : undefined }} />
            {zone.trend}
          </span>
        </div>
        <div className={`flex items-center gap-4 ${compact ? "mt-2" : "mt-3"}`}>
          <div className="min-w-0 flex-1">
            <div className={`font-extrabold leading-none tracking-tight ${compact ? "text-3xl" : "text-[40px]"}`} style={{ color: m.color }}>
              {zone.category}
            </div>
            <div className="mt-2 text-sm font-medium text-fg/90">
              {HAZARD_LABEL[zone.hazard]} · score <span className="font-mono tabular">{zone.score}</span>/100
            </div>
          </div>
          <div className="shrink-0">
            <Gauge score={zone.score} size={compact ? 110 : 130} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Peak" value={zone.peakIn <= 0.05 ? "Now" : inHours(zone.peakIn).replace("in ", "")} sub={`score ${zone.peakScore}`} />
          <Stat label={nextEta?.label ?? "Next change"} value={nextEta?.value ?? "None in 12 h"} />
          <Stat label="Flood depth" value={zone.depthM > 0 ? `≈${zone.depthM} m` : "Minimal"} sub="at low points" />
        </div>
        {!compact && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-dim">
              <span className="flex items-center gap-1">
                <Clock size={11} /> Next 12 hours
              </span>
              <span>+12 h</span>
            </div>
            <Sparkline values={zone.forecast} height={46} />
          </div>
        )}
        {showFactors && !compact && (
          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-xs font-semibold text-brand hover:underline">Why this score? ▾</summary>
            <div className="mt-2">
              <FactorBars z={zone} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-black/20 px-2 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular">{value}</div>
      {sub && <div className="text-[10px] text-dim">{sub}</div>}
    </div>
  );
}
