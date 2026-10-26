"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Info, X } from "lucide-react";

export interface Toast {
  id: string;
  tone: "danger" | "warn" | "info" | "ok";
  title: string;
  body?: string;
}

const TONE = {
  danger: { c: "#ef4444", icon: AlertTriangle },
  warn: { c: "#f97316", icon: BellRing },
  info: { c: "#3cc7f5", icon: Info },
  ok: { c: "#22c55e", icon: CheckCircle2 },
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Set<string>());
  const push = useCallback((t: Toast) => {
    if (seen.current.has(t.id)) return;
    seen.current.add(t.id);
    setToasts((x) => [...x.slice(-3), t]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 7000);
  }, []);
  const dismiss = useCallback((id: string) => setToasts((x) => x.filter((y) => y.id !== id)), []);
  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed right-3 top-16 z-[2500] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const m = TONE[t.tone];
        return (
          <div key={t.id} className="rise pointer-events-auto flex gap-3 rounded-xl border bg-panel/95 p-3 shadow-2xl backdrop-blur" style={{ borderColor: `${m.c}66` }}>
            <m.icon size={18} style={{ color: m.c }} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.body && <div className="mt-0.5 line-clamp-3 text-xs text-fg/80">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="self-start text-dim hover:text-fg" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Staff pop-ups: polls /api/admin/pulse for new events. */
export function StaffPulse() {
  const { toasts, push, dismiss } = useToasts();
  const since = useRef<string | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const url = since.current ? `/api/admin/pulse?since=${encodeURIComponent(since.current)}` : "/api/admin/pulse";
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { items: (Toast & { at: string })[]; now: string };
        if (since.current) d.items.forEach((i) => push(i));
        since.current = d.now;
      } catch {
        /* offline */
      }
    };
    tick();
    const t = setInterval(() => !stop && !document.hidden && tick(), 6000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [push]);
  return <ToastStack toasts={toasts} dismiss={dismiss} />;
}
