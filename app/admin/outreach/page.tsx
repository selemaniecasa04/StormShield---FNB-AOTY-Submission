"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, PhoneCall, PhoneIncoming, PhoneMissed, Rocket, Square } from "lucide-react";
import AdminShell from "@/components/admin/Shell";
import PersonDrawer from "@/components/admin/PersonDrawer";
import OutreachFlow from "@/components/OutreachFlow";
import ProgressBar, { type OutreachStats as Stats } from "@/components/admin/ProgressBar";
import { PanelHead } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/client";
import { ZONES } from "@/lib/geo";
import { RESULT_LABEL, OUTREACH } from "@/lib/outreach-text";
import { clock, timeAgo } from "@/lib/format";
import type { StatusResponse } from "@/lib/types";
import { LEVEL_META } from "@/lib/risk";
import { langName } from "@/lib/i18n";

interface Target {
  id: number; campaignId: number; userId: number; status: string; attempts: number; key: string | null; result: string | null; escalated: boolean;
  updatedAt: string; nextAt: string; ringAt: string | null; name: string; phone: string; vulnerable: string[]; zone: string | null; language: string; insured: boolean;
}
interface Data {
  stats: Stats;
  campaigns: { id: number; title: string; kind: string; audience: string; zones: string[]; auto: boolean; created_at: string; by: string | null; insurer_id: string | null; stats: Stats }[];
  targets: Target[];
  attempts: { targetId: number; attempt: number; startedAt: string; endedAt: string | null; outcome: string | null; key: string | null }[];
}

const OUTCOME: Record<string, string> = { no_answer: "No answer", declined: "Declined", no_key: "Answered, no key", answered: "Answered" };

export default function OutreachPage() {
  const { data, refresh } = usePoll<Data>("/api/admin/outreach", 3000);
  const st = usePoll<StatusResponse>("/api/status", 15000);
  const [person, setPerson] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = useMemo(() => (data?.targets ?? []).filter((t) => ["ringing", "in_call", "queued"].includes(t.status)).sort((a, b) => (a.status === "queued" ? 1 : 0) - (b.status === "queued" ? 1 : 0)), [data]);
  const names = useMemo(() => Object.fromEntries((data?.targets ?? []).map((t) => [t.id, t.name])), [data]);

  return (
    <AdminShell title="Call outreach" sub="Automated calls and SMS to people in danger, with 3 attempts before escalation">
      <div className="panel p-5">
        <PanelHead title="How it works" />
        <OutreachFlow />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 [&>*]:min-w-0">
        <div className="space-y-4 xl:col-span-4">
          <Launch zonesLevel={Object.fromEntries((st.data?.snap.zones ?? []).map((z) => [z.id, z.level]))} onDone={refresh} />
          {data && (
            <div className="panel p-5">
              <PanelHead title="All calls this event" />
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Reached" v={data.stats.reached} c="#22c55e" />
                <Stat label="In progress" v={data.stats.ringing + data.stats.queued} c="#a78bfa" />
                <Stat label="Unreached" v={data.stats.unreached} c="#f97316" />
              </div>
              <ProgressBar s={data.stats} />
            </div>
          )}
        </div>

        <div className="panel p-5 xl:col-span-4">
          <PanelHead icon={<PhoneIncoming size={13} />} title={`Live call board (${live.length})`} sub="Updates every 3 seconds" />
          {!live.length ? (
            <div className="rounded-xl border border-dashed border-line2 p-4 text-center text-sm text-mute">No calls in progress.</div>
          ) : (
            <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1 thin-scroll">
              {live.map((t) => {
                const ringing = t.status === "ringing" || t.status === "in_call";
                const secs = ringing && t.ringAt ? Math.max(0, OUTREACH.ringSec - Math.floor((now - new Date(t.ringAt).getTime()) / 1000)) : Math.max(0, Math.ceil((new Date(t.nextAt).getTime() - now) / 1000));
                return (
                  <li key={t.id} className={`rounded-xl border p-3 ${ringing ? "border-violet/50 bg-violet/[.06]" : "border-line bg-black/20"}`}>
                    <div className="flex items-center gap-2">
                      {ringing ? <PhoneCall size={15} className="animate-pulse text-violet" /> : <PhoneMissed size={15} className="text-dim" />}
                      <button onClick={() => setPerson(t.userId)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline">{t.name}</button>
                      <span className="font-mono text-xs text-mute">{ringing ? `${t.status === "in_call" ? "on call" : "ringing"} ${secs}s` : `call ${t.attempts + 1} in ${secs}s`}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-dim">
                      <span>{t.zone}</span>·<span>attempt {Math.max(1, t.attempts)} of 3</span>
                      {t.vulnerable.length > 0 && <span className="text-violet">· {t.vulnerable.join(", ")}</span>}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {[1, 2, 3].map((n) => (
                        <span key={n} className={`h-1 flex-1 rounded-full ${n < t.attempts || (n === t.attempts && !ringing) ? "bg-warn" : n === t.attempts ? "animate-pulse bg-violet" : "bg-white/10"}`} />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="panel p-5 xl:col-span-4">
          <PanelHead title="Call log" sub="Every attempt and keypad response" />
          <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1 thin-scroll">
            {(data?.attempts ?? []).slice(0, 80).map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${a.outcome === "answered" ? "bg-safe" : a.outcome ? "bg-warn" : "animate-pulse bg-violet"}`} />
                <span className="w-11 font-mono text-dim">{clock(a.startedAt)}</span>
                <span className="min-w-0 flex-1 truncate">{names[a.targetId] ?? "Resident"}</span>
                <span className="text-mute">#{a.attempt} {a.outcome ? OUTCOME[a.outcome] ?? a.outcome : "ringing"}{a.key ? ` · key ${a.key}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel p-5">
        <PanelHead title="Campaigns" sub="Automatic campaigns start when an area escalates; staff and insurers can launch their own" />
        {!data ? (
          <Loader2 className="animate-spin text-mute" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-dim">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Campaign</th>
                  <th className="py-2 pr-3 font-semibold">Started</th>
                  <th className="py-2 pr-3 font-semibold">By</th>
                  <th className="w-[34%] py-2 pr-3 font-semibold">Progress</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.campaigns.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{c.title}</div>
                      <div className="text-[11px] text-mute">{c.kind === "evacuate" ? "Evacuation message" : "Warning message"} · {c.stats.total} people</div>
                    </td>
                    <td className="py-2.5 pr-3 text-mute">{timeAgo(c.created_at)}</td>
                    <td className="py-2.5 pr-3 text-mute">{c.auto ? "Automatic" : c.insurer_id ? "Insurer" : c.by ?? "Staff"}</td>
                    <td className="py-2.5 pr-3"><ProgressBar s={c.stats} /></td>
                    <td className="py-2.5 text-right">
                      {c.stats.queued > 0 && (
                        <button className="btn btn-ghost !px-2 !py-1 text-[11px]" onClick={() => api("/api/admin/outreach", { body: { action: "stop", campaignId: c.id } }).then(refresh)}>
                          <Square size={11} /> Stop
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel p-5">
        <PanelHead title="Responses" sub="Who answered and what they pressed" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-dim">
              <tr>
                <th className="py-2 pr-3 font-semibold">Resident</th>
                <th className="py-2 pr-3 font-semibold">Area</th>
                <th className="py-2 pr-3 font-semibold">Language</th>
                <th className="py-2 pr-3 font-semibold">Calls</th>
                <th className="py-2 pr-3 font-semibold">Result</th>
                <th className="py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data?.targets ?? []).filter((t) => t.status === "reached" || t.status === "unreached").slice(0, 60).map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-white/[.02]" onClick={() => setPerson(t.userId)}>
                  <td className="py-2 pr-3 font-medium">{t.name}{t.vulnerable.length ? <span className="ml-1.5 text-[10px] text-violet">{t.vulnerable.join(", ")}</span> : null}</td>
                  <td className="py-2 pr-3 text-mute">{t.zone}</td>
                  <td className="py-2 pr-3 text-mute">{langName(t.language)}</td>
                  <td className="py-2 pr-3 font-mono">{t.attempts}</td>
                  <td className="py-2 pr-3">
                    {t.status === "unreached" ? <span className="font-semibold text-warn">Unreached · family notified</span> : <span>{RESULT_LABEL[t.result ?? ""] ?? t.result}</span>}
                  </td>
                  <td className="py-2 text-mute">{timeAgo(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <PersonDrawer userId={person} onClose={() => setPerson(null)} onChange={refresh} />
    </AdminShell>
  );
}

function Stat({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div className="rounded-xl border border-line bg-black/20 py-2">
      <div className="text-xl font-bold tabular" style={{ color: c }}>{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-dim">{label}</div>
    </div>
  );
}

function Launch({ zonesLevel, onDone }: { zonesLevel: Record<string, string>; onDone: () => void }) {
  const [preset, setPreset] = useState<"red" | "orange+" | "pick">("red");
  const [zones, setZones] = useState<string[]>([]);
  const [audience, setAudience] = useState<"zone" | "vulnerable">("zone");
  const [kind, setKind] = useState<"warning" | "evacuate">("evacuate");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const launch = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ count: number }>("/api/admin/outreach", { body: { action: "launch", preset: preset === "pick" ? undefined : preset, zoneIds: zones, audience, kind, message } });
      setMsg(r.count ? `${r.count} people queued. Calls start now.` : "Everyone in those areas is already being called or has answered.");
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel p-5">
      <PanelHead icon={<Rocket size={13} />} title="Launch calls" />
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-1 text-xs">
          {([["red", "All red areas"], ["orange+", "Red + orange"], ["pick", "Choose areas"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} className={`rounded-md py-1.5 font-semibold ${preset === k ? "bg-white/10" : "text-mute"}`}>{l}</button>
          ))}
        </div>
        {preset === "pick" && (
          <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto thin-scroll">
            {ZONES.map((z) => {
              const on = zones.includes(z.id);
              const lv = zonesLevel[z.id] as keyof typeof LEVEL_META | undefined;
              return (
                <button key={z.id} onClick={() => setZones((x) => (on ? x.filter((y) => y !== z.id) : [...x, z.id]))} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-brand bg-brand/15" : "border-line2 text-mute"}`}>
                  {lv && <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_META[lv].color }} />} {z.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-mute">
            Who
            <select className="input mt-1 text-sm" value={audience} onChange={(e) => setAudience(e.target.value as "zone" | "vulnerable")}>
              <option value="zone">Everyone registered</option>
              <option value="vulnerable">Vulnerable people only</option>
            </select>
          </label>
          <label className="text-xs text-mute">
            Message
            <select className="input mt-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value as "warning" | "evacuate")}>
              <option value="evacuate">Evacuate now</option>
              <option value="warning">Prepare (warning)</option>
            </select>
          </label>
        </div>
        <textarea className="input min-h-[56px] text-sm" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional custom message (English). Leave empty for the translated standard message." maxLength={300} />
        <button className="btn btn-primary w-full" disabled={busy || (preset === "pick" && !zones.length)} onClick={launch}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <PhoneCall size={15} />} Start calling
        </button>
        {msg && <div className="text-xs text-fg/85">{msg}</div>}
      </div>
    </div>
  );
}
