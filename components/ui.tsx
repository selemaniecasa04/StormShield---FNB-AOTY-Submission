"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { LEVEL_META, type Level } from "@/lib/risk";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="ssg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3cc7f5" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 4.5 7v8.2c0 7.1 4.9 12.6 11.5 14.3 6.6-1.7 11.5-7.2 11.5-14.3V7L16 2.5Z" fill="url(#ssg)" />
      <path d="M8.5 17.2c1.9-1.5 3.6-1.5 5.3 0s3.6 1.5 5.4 0 3.5-1.5 4.8-.3" fill="none" stroke="#04121b" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.8 21.6c1.8-1.3 3.4-1.3 5.1 0s3.4 1.3 5.1 0 3.2-1.3 4.4-.3" fill="none" stroke="#04121b" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
      <path d="m17.5 6.5-4 6h3.2l-1.7 4.5 4.6-6.2h-3.3l1.2-4.3Z" fill="#facc15" />
    </svg>
  );
}

export function LevelDot({ level, className = "" }: { level: Level; className?: string }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} style={{ background: LEVEL_META[level].color, boxShadow: `0 0 10px ${LEVEL_META[level].color}` }} />;
}

export function LevelPill({ level, children, size = "sm" }: { level: Level; children?: ReactNode; size?: "sm" | "md" }) {
  const m = LEVEL_META[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"}`}
      style={{ background: m.soft, color: m.text, border: `1px solid ${m.color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {children ?? m.label}
    </span>
  );
}

export function Sparkline({
  values,
  height = 40,
  width = 160,
  bands = true,
  marker,
  className = "",
}: {
  values: number[];
  height?: number;
  width?: number;
  bands?: boolean;
  marker?: number;
  className?: string;
}) {
  const id = useId();
  if (!values.length) return null;
  const max = 100;
  const step = width / Math.max(1, values.length - 1);
  const y = (v: number) => height - (Math.min(max, v) / max) * (height - 4) - 2;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const peak = Math.max(...values);
  const color = peak >= 75 ? "#ef4444" : peak >= 50 ? "#f97316" : peak >= 25 ? "#facc15" : "#22c55e";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {bands &&
        [25, 50, 75].map((b) => (
          <line key={b} x1="0" x2={width} y1={y(b)} y2={y(b)} stroke={b === 75 ? "#ef4444" : b === 50 ? "#f97316" : "#facc15"} strokeOpacity=".22" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={`url(#g${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {marker !== undefined && <line x1={marker * step} x2={marker * step} y1="0" y2={height} stroke="#e7eef5" strokeOpacity=".6" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function Modal({ open, onClose, title, children, tone = "default", wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; tone?: "default" | "danger"; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={`rise max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-panel p-5 thin-scroll sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} ${tone === "danger" ? "border-danger/50 shadow-[0_0_60px_rgba(239,68,68,.25)]" : "border-line2"}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-mute hover:bg-white/5 hover:text-fg" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent" style={{ width: size, height: size }} aria-hidden />;
}

export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg/90">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-dim">{hint}</span> : null}
    </label>
  );
}

export function PanelHead({ icon, title, right, sub }: { icon?: ReactNode; title: string; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 label">
          {icon}
          {title}
        </div>
        {sub && <div className="mt-1 text-xs text-dim">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line2 p-4 text-center text-sm text-mute">{children}</div>;
}
