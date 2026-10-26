"use client";
import { useEffect, useState } from "react";
import { HeartPulse, Loader2, MessageSquareText, PhoneCall, Siren, X } from "lucide-react";
import { api } from "@/lib/client";
import { CHECK_META, LEVEL_META, TICKET_STATUS_LABEL, TICKET_TYPES, type CheckStatus, type Level, type TicketStatus, type TicketType } from "@/lib/risk";
import { clock, timeAgo } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import DispatchModal, { type DispatchTarget } from "./DispatchModal";
import Link from "next/link";
import { withEmergencyFooter } from "@/lib/emergency";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = { person: any; family: any[]; checkins: any[]; tickets: any[]; calls: any[]; messages: any[]; phoneSessions?: any[] };

export default function PersonDrawer({ userId, onClose, onChange }: { userId: number | null; onClose: () => void; onChange?: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sms, setSms] = useState("");
  const [dispatch, setDispatch] = useState<DispatchTarget | null>(null);

  const load = async (id: number) => {
    try {
      setD(await api<Detail>(`/api/admin/people?id=${id}`));
    } catch {
      setD(null);
    }
  };
  useEffect(() => {
    setD(null);
    setNote(null);
    if (userId) load(userId);
  }, [userId]);

  if (!userId) return null;
  const p = d?.person;
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setNote(null);
    try {
      await fn();
      setNote(ok);
      onChange?.();
      if (userId) load(userId);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const pos: LatLng | null = p ? (p.gps_lat != null && p.gps_at && Date.now() - new Date(p.gps_at).getTime() < 12 * 3_600_000 ? [p.gps_lat, p.gps_lng] : [p.home_lat, p.home_lng]) : null;

  return (
    <div className="fixed inset-0 z-[1900] flex justify-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="rise h-full w-full max-w-md overflow-y-auto border-l border-line2 bg-panel p-5 thin-scroll" role="dialog" aria-label="Resident details">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="label">Resident</div>
            <h2 className="text-xl font-semibold">{p ? `${p.first_name} ${p.surname}` : "Loading…"}</h2>
            {p && <div className="text-sm text-mute">{p.phone} · {p.languageName}{p.channel === "ussd" ? " · basic phone (USSD + SMS + voice, no app)" : ""}</div>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-mute hover:bg-white/5 hover:text-fg" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {!p ? (
          <Loader2 className="animate-spin text-mute" />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <button className="btn btn-primary !px-2 text-xs" disabled={!!busy} onClick={() => act("call", () => api("/api/admin/outreach", { body: { action: "call", userId, kind: p.level === "red" ? "evacuate" : "warning" } }), "Call placed. Their phone is ringing.")}>
                {busy === "call" ? <Loader2 size={13} className="animate-spin" /> : <PhoneCall size={13} />} Call
              </button>
              <button className="btn btn-danger !px-2 text-xs" onClick={() => pos && setDispatch({ type: p.vulnerable ? "welfare" : "rescue", p: pos, name: `${p.first_name} ${p.surname}`, createFor: { userId } })}>
                <Siren size={13} /> Send help
              </button>
              <a className="btn btn-ghost !px-2 text-xs" href={`tel:${p.phone}`}>
                <PhoneCall size={13} /> Dial
              </a>
            </div>
            {note && <div className="rounded-lg bg-white/5 px-3 py-2 text-xs">{note}</div>}

            <dl className="divide-y divide-line rounded-xl border border-line">
              {[
                ["Home", `${p.home_address}${p.homeZoneName ? ` (${p.homeZoneName})` : ""}`],
                ["Work", p.work_address ? `${p.work_address}${p.workZoneName ? ` (${p.workZoneName})` : ""}` : "—"],
                ["Area risk", p.level ? LEVEL_META[p.level as Level].label : "—"],
                ["Vulnerable", p.vulnerable ? p.vulnerable.replace(/,/g, ", ") : "No"],
                ["Medical", p.medical || "—"],
                ["Emergency contact", `${p.emergency_name} · ${p.emergency_phone}`],
                ["Insurance", p.insurer ? `${p.insurer} (${p.policy_no})` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 px-3 py-2">
                  <dt className="w-32 shrink-0 text-mute">{k}</dt>
                  <dd className="min-w-0 flex-1">{v}</dd>
                </div>
              ))}
            </dl>

            <Section title="Help requests">
              {d!.tickets.length ? d!.tickets.map((t) => (
                <Row key={t.id} left={`${t.ref} · ${TICKET_TYPES[t.type as TicketType] ?? t.type}`} right={`${TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status}${t.team ? ` · ${t.team}` : ""}`} />
              )) : <Empty />}
            </Section>
            <Section title="Calls">
              {d!.calls.length ? d!.calls.map((c, i) => (
                <Row key={i} left={`${clock(c.started_at)} · call ${c.attempt}`} right={`${c.outcome ?? "ringing"}${c.key ? ` · pressed ${c.key}` : ""}`} />
              )) : <Empty />}
            </Section>
            {(d!.phoneSessions?.length || p.channel === "ussd") && (
              <Section title="Feature phone (USSD / voice keypad)">
                {d!.phoneSessions?.length ? d!.phoneSessions.map((x) => (
                  <Row key={x.id} left={`${clock(x.started_at)} · ${x.channel === "ussd" ? "USSD" : "Voice"}`} right={x.outcome_label ?? (x.ended_at ? "Ended" : "In progress")} />
                )) : <Empty />}
                <Link href="/admin/phones" className="text-[11px] text-brand hover:underline">Open full transcripts →</Link>
              </Section>
            )}
            <Section title="Check-ins">
              {d!.checkins.length ? d!.checkins.map((c, i) => (
                <Row key={i} left={`${CHECK_META[c.status as CheckStatus]?.label ?? c.status}${c.note ? ` · ${c.note}` : ""}`} right={timeAgo(c.created_at)} />
              )) : <Empty />}
            </Section>
            <Section title="Family">
              {d!.family.length ? d!.family.map((f, i) => <Row key={i} left={`${f.name} (${f.relation})`} right={f.phone} />) : <Empty />}
            </Section>

            <div>
              <div className="label mb-1.5 flex items-center gap-1.5"><MessageSquareText size={12} /> Send SMS</div>
              <div className="flex gap-2">
                <input className="input text-sm" value={sms} onChange={(e) => setSms(e.target.value)} placeholder="e.g. A team is coming to your street." maxLength={300} />
                <button className="btn btn-ghost shrink-0" disabled={sms.length < 3 || !!busy} onClick={() => act("sms", () => api("/api/admin/people", { body: { userId, text: sms } }).then(() => setSms("")), "SMS sent.")}>Send</button>
              </div>
            </div>
            <Section title="Recent messages">
              {d!.messages.slice(0, 8).map((m, i) => (
                <div key={i} className="text-xs"><span className="font-semibold uppercase text-dim">{m.channel}</span> → {m.to_name}: <span className="whitespace-pre-line text-fg/80">{m.channel === "sms" ? withEmergencyFooter(m.body) : m.body}</span></div>
              ))}
            </Section>
            {p.medical && <div className="flex items-center gap-1.5 text-[11px] text-dim"><HeartPulse size={12} /> Medical details are visible to disaster management staff only.</div>}
          </div>
        )}
      </aside>
      <DispatchModal target={dispatch} onClose={() => setDispatch(null)} onDone={() => { setNote("Emergency services requested."); onChange?.(); if (userId) load(userId); }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
const Row = ({ left, right }: { left: string; right: string }) => (
  <div className="flex justify-between gap-3 text-xs"><span className="text-fg/90">{left}</span><span className="text-mute">{right}</span></div>
);
const Empty = () => <div className="text-xs text-dim">None</div>;
