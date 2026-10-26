"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, PhoneCall, PhoneIncoming, PhoneMissed, Siren, Truck } from "lucide-react";
import { api } from "@/lib/client";
import { TICKET_FLOW, TICKET_STATUS_LABEL, TICKET_TYPES, type TicketStatus, type TicketType } from "@/lib/risk";
import { UNIT_TYPES, unitPosition, type UnitType } from "@/lib/dispatch";
import { RESULT_LABEL } from "@/lib/outreach-text";
import { clock, timeAgo } from "@/lib/format";
import { distanceKm } from "@/lib/geo";
import type { MyCall, MyTicket } from "@/lib/types";
import { PanelHead } from "../ui";
import OutreachFlow from "../OutreachFlow";

/** Live tracker for the resident's open help request, synced with the command centre's dispatch. */
export function HelpStatus({ tickets, onChange }: { tickets: MyTicket[]; onChange: () => void }) {
  const open = tickets.filter((t) => t.status !== "resolved");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!open.length) return null;
  return (
    <div className="space-y-3">
      {open.map((t) => (
        <Tracker key={t.id} t={t} now={now} onChange={onChange} />
      ))}
    </div>
  );
}

function Tracker({ t, now, onChange }: { t: MyTicket; now: number; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const idx = TICKET_FLOW.indexOf(t.status as TicketStatus);
  const u = t.unit;
  const eta = u?.etaAt ? Math.max(0, Math.ceil((new Date(u.etaAt).getTime() - now) / 60000)) : null;
  const pos = u ? unitPosition(u.base, t.p, u.dispatchedAt, u.etaAt, t.status) : null;
  const left = pos ? distanceKm(pos, t.p) * 1.35 : null;
  const total = u ? distanceKm(u.base, t.p) * 1.35 : null;
  const pct = left !== null && total ? Math.round((1 - left / Math.max(0.01, total)) * 100) : 0;
  return (
    <div className="panel border-danger/50 p-4 shadow-[0_0_30px_rgba(239,68,68,.12)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Siren size={16} className="text-danger" /> {t.ref} · {TICKET_TYPES[t.type as TicketType] ?? t.type}
        </div>
        <span className="text-[11px] text-dim">{timeAgo(t.created_at)}</span>
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1">
        {TICKET_FLOW.map((s, i) => (
          <li key={s} className="text-center">
            <div className={`h-1.5 rounded-full ${i <= idx ? "bg-danger" : "bg-white/10"} ${i === idx ? "animate-pulse" : ""}`} />
            <div className={`mt-1 text-[10px] leading-tight ${i <= idx ? "text-fg" : "text-dim"}`}>{TICKET_STATUS_LABEL[s]}</div>
          </li>
        ))}
      </ol>
      {u ? (
        <div className="mt-3 rounded-xl border border-line bg-black/25 p-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${UNIT_TYPES[u.type as UnitType]?.color ?? "#3cc7f5"}22`, color: UNIT_TYPES[u.type as UnitType]?.color }}>
              <Truck size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{u.name}</div>
              <div className="text-[11px] text-mute">{UNIT_TYPES[u.type as UnitType]?.label}</div>
            </div>
            <div className="text-right">
              {t.status === "on_scene" ? (
                <div className="text-sm font-bold text-safe">With you</div>
              ) : (
                <>
                  <div className="font-mono text-xl font-bold tabular">{eta}<span className="text-xs font-normal text-mute"> min</span></div>
                  <div className="text-[10px] text-dim">ETA {u.etaAt ? clock(u.etaAt) : ""}</div>
                </>
              )}
            </div>
          </div>
          {t.status === "en_route" && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[.07]">
                <div className="h-full rounded-full bg-brand transition-all duration-1000" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-dim">{left !== null ? `${left.toFixed(1)} km away` : ""}</div>
            </div>
          )}
          {u.phone && (
            <a href={`tel:${u.phone}`} className="btn btn-ghost mt-2 w-full !py-1.5 text-xs">
              <PhoneCall size={13} /> Call the team
            </a>
          )}
        </div>
      ) : (
        <div className="mt-3 text-xs text-mute">The command centre has your request and location. A team will be assigned shortly.</div>
      )}
      <button
        className="mt-2 text-xs font-semibold text-mute underline-offset-2 hover:text-fg hover:underline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/tickets/${t.id}`, { method: "PATCH", body: { status: "resolved" } });
            onChange();
          } finally {
            setBusy(false);
          }
        }}
      >
        I&apos;m OK now, cancel this request
      </button>
    </div>
  );
}

/** Banner when StormShield could not reach the resident by phone. */
export function MissedCallsBanner({ calls }: { calls: MyCall[] }) {
  const last = calls[0];
  if (!last || last.status !== "unreached") return null;
  const times = last.tries.map((x) => clock(x.started_at)).join(", ");
  return (
    <div className="rise mb-4 flex items-start gap-3 rounded-2xl border border-warn/50 bg-warn/10 p-4">
      <PhoneMissed size={22} className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">You missed {last.attempts} calls from StormShield</div>
        <div className="text-sm text-fg/80">
          We called at {times}. Your emergency contact has been told we could not reach you. Please check in below so responders know you are OK.
        </div>
      </div>
    </div>
  );
}

const OUTCOME: Record<string, string> = { no_answer: "No answer", declined: "Declined", no_key: "Answered, no key pressed", answered: "Answered" };

export function CallHistory({ calls, onChange }: { calls: MyCall[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = useMemo(() => calls.flatMap((c) => c.tries.map((t) => ({ ...t, title: c.title }))).sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at)), [calls]);
  const preview = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/outreach/preview", { body: {} });
      setMsg("Calling you now…");
      onChange();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel p-5">
      <PanelHead
        icon={<PhoneIncoming size={13} />}
        title="How StormShield reaches you"
        sub="Automatic calls and SMS when your area is in danger"
        right={
          <button onClick={preview} disabled={busy} className="btn btn-primary !px-3 !py-1.5 text-xs">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <PhoneCall size={13} />} Try a test call
          </button>
        }
      />
      {msg && <div className="mb-3 text-xs text-brand">{msg}</div>}
      <OutreachFlow compact />
      <div className="mt-4">
        <div className="label mb-2">Your call history</div>
        {rows.length === 0 ? (
          <div className="text-sm text-mute">No calls yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {rows.slice(0, 8).map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${r.outcome === "answered" ? "bg-safe" : r.outcome ? "bg-warn" : "animate-pulse bg-brand"}`} />
                <span className="w-12 font-mono text-dim">{clock(r.started_at)}</span>
                <span className="flex-1 truncate text-fg/85">
                  Call {r.attempt} · {r.outcome ? OUTCOME[r.outcome] ?? r.outcome : "Ringing"}
                  {r.key ? ` · pressed ${r.key}` : ""}
                </span>
                <span className="truncate text-dim">{r.title}</span>
              </li>
            ))}
          </ul>
        )}
        {calls[0]?.result && <div className="mt-2 text-xs text-mute">Latest response: {RESULT_LABEL[calls[0].result] ?? calls[0].result}</div>}
      </div>
    </div>
  );
}
