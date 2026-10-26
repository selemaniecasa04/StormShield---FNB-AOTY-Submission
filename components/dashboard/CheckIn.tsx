"use client";
import { useState } from "react";
import { Accessibility, CheckCircle2, Footprints, HandHelping, Loader2 } from "lucide-react";
import { api, getPosition } from "@/lib/client";
import { CHECK_META, type CheckStatus } from "@/lib/risk";
import { timeAgo } from "@/lib/format";
import type { MeResponse } from "@/lib/types";
import { PanelHead } from "../ui";

const BTNS: { s: CheckStatus; icon: React.ComponentType<{ size?: number }> }[] = [
  { s: "safe", icon: CheckCircle2 },
  { s: "evacuating", icon: Footprints },
  { s: "need_help", icon: HandHelping },
  { s: "vulnerable_present", icon: Accessibility },
];

export default function CheckIn({ me, urgent, onChange }: { me: MeResponse; urgent: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState<CheckStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<{ status: string; created_at: string } | null>(null);
  const current = optimistic && (!me.checkin || new Date(optimistic.created_at) > new Date(me.checkin.created_at)) ? optimistic : me.checkin;

  const send = async (s: CheckStatus) => {
    setBusy(s);
    setMsg(null);
    let pos: { lat: number; lng: number } | null = null;
    try {
      pos = await getPosition(4000);
    } catch {
      /* fall back to stored location */
    }
    try {
      const r = await api<{ ticket: string | null }>("/api/checkins", { body: { status: s, lat: pos?.lat, lng: pos?.lng } });
      setOptimistic({ status: s, created_at: new Date().toISOString() });
      setMsg(s === "need_help" ? `Responders notified · ticket ${r.ticket}` : s === "safe" ? "Thank you. Your family and responders can see you're safe." : "Status shared with responders.");
      onChange();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pending = !current;
  return (
    <div className={`panel p-5 ${urgent && pending ? "border-warn/60 shadow-[0_0_30px_rgba(249,115,22,.15)]" : ""}`}>
      <PanelHead
        title="Safety check-in"
        right={
          current ? (
            <span className="text-[11px] text-dim">updated {timeAgo(current.created_at)}</span>
          ) : (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">Pending</span>
          )
        }
      />
      {urgent && pending && (
        <div className="mb-3 rounded-xl border border-warn/40 bg-warn/10 p-3">
          <div className="font-semibold">{me.checkinPrompt.text}</div>
          {me.checkinPrompt.text !== me.checkinPrompt.english && <div className="text-xs text-mute">{me.checkinPrompt.english}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {BTNS.map(({ s, icon: Icon }) => {
          const on = current?.status === s;
          const m = CHECK_META[s];
          return (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy !== null}
              aria-pressed={on}
              className="relative flex min-h-[78px] flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left text-sm font-semibold transition hover:brightness-125 disabled:opacity-60"
              style={{ borderColor: on ? m.color : "var(--color-line2)", background: on ? `${m.color}22` : "rgba(0,0,0,.2)" }}
            >
              <span style={{ color: m.color }}>{busy === s ? <Loader2 size={20} className="animate-spin" /> : <Icon size={20} />}</span>
              <span className="leading-tight">{m.label}</span>
              {on && <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }} />}
            </button>
          );
        })}
      </div>
      {msg && <div className="rise mt-3 text-xs text-fg/85">{msg}</div>}
    </div>
  );
}
