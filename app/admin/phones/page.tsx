"use client";
import { useEffect, useMemo, useState } from "react";
import { Activity, Cable, Clock, Hash, Loader2, MapPin, PhoneCall, PhoneIncoming, Siren, Smartphone, UserRound, Users } from "lucide-react";
import AdminShell from "@/components/admin/Shell";
import DispatchModal, { type DispatchTarget } from "@/components/admin/DispatchModal";
import PersonDrawer from "@/components/admin/PersonDrawer";
import { StormMap, DEFAULT_LAYERS } from "@/components/map";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/client";
import { LEVEL_META, PRIORITY_COLOR, CHECK_META, type CheckStatus, type Level } from "@/lib/risk";
import { clock, timeAgo } from "@/lib/format";
import { USSD_CODE } from "@/lib/emergency";
import type { LatLng } from "@/lib/geo";
import type { StatusResponse } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Step { at: string; in: string | null; out: string; end: boolean; screen: string; screenLabel: string }
interface Session {
  id: number; channel: "ussd" | "ivr"; sessionId: string; phone: string; serviceCode: string | null; network: string | null; origin: string; lang: string;
  status: "complete" | "live" | "timed_out"; outcome: string | null; label: string; detail: Record<string, any>; startedAt: string; updatedAt: string; endedAt: string | null; durationSec: number;
  steps: Step[];
  person: { id: number; name: string; address: string; area: string | null; level: Level | null; category: string | null; vulnerable: string | null; medical: string | null; language: string; emergency: string | null; channel: string; home: LatLng; family: string[] } | null;
  ticket: { id: number; ref: string; status: string; statusLabel: string; type: string; typeLabel: string; priority: string; people: number; team: string | null; p: LatLng; note: string | null; unit: string | null } | null;
  reportId: number | null;
}
interface Data {
  kpi: { sessions: number; numbers: number; live: number; safe: number; help: number; reports: number; registered: number; dropped: number; avgSec: number };
  sessions: Session[];
  users: { id: number; name: string; phone: string; area: string | null; language: string; vulnerable: string; createdAt: string; last: string | null; status: string | null }[];
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "action", label: "Needs action" },
  { id: "safe", label: "Check-ins" },
  { id: "info", label: "Info & reports" },
  { id: "reg", label: "Registrations" },
  { id: "open", label: "Live / dropped" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const NEEDS = new Set(["help", "callback", "call_key_3", "call_key_4"]);
function tone(s: Session) {
  if (s.status === "live") return { c: "#3cc7f5", t: "LIVE" };
  if (s.status === "timed_out") return { c: "#8b9db0", t: "DROPPED" };
  if (s.outcome && NEEDS.has(s.outcome)) return { c: s.outcome === "call_key_4" || s.ticket?.priority === "urgent" ? "#ef4444" : "#f97316", t: "HELP" };
  if (s.outcome === "safe" || s.outcome === "call_key_1") return { c: "#22c55e", t: "SAFE" };
  if (s.outcome === "evacuating" || s.outcome === "call_key_2") return { c: "#facc15", t: "LEAVING" };
  if (s.outcome === "registered") return { c: "#a78bfa", t: "NEW" };
  if (s.outcome === "declined") return { c: "#8b9db0", t: "MISSED" };
  return { c: "#3cc7f5", t: "INFO" };
}
const match = (s: Session, f: Filter) =>
  f === "all" ||
  (f === "action" && !!s.outcome && NEEDS.has(s.outcome)) ||
  (f === "safe" && ["safe", "evacuating", "call_key_1", "call_key_2"].includes(s.outcome ?? "")) ||
  (f === "info" && ["info_risk", "info_shelter", "report", "family", "numbers"].includes(s.outcome ?? "")) ||
  (f === "reg" && s.outcome === "registered") ||
  (f === "open" && s.status !== "complete");

const KEY_LABEL: Record<string, string> = {
  where: "Where they are", status: "Status", help: "Help needed", ticketType: "Request type", priority: "Priority", people: "People", vulnerable: "Vulnerable person present",
  location: "Location source", landmark: "Landmark typed", kind: "Hazard", area: "Area", score: "Risk score", level: "Level", shelter: "Shelter sent", km: "Distance (km)",
  familyNotified: "Family told", asked: "Asked to check in", language: "Language", callQueued: "Welcome call queued", name: "Name", regLang: "Language code", vul: "Vulnerability",
  key: "Key pressed", result: "Result", ticket: "Help request", attempt: "Call attempt", answers: "Follow-up answers", zoneId: "Area id",
};
const HIDE = new Set(["screen", "hasFamily", "page", "pending", "lat", "lng", "atHome", "lang", "zoneId", "regLang"]);

function fmt(v: any): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v == null || v === "") return "—";
  if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${KEY_LABEL[k] ?? k}: ${x}`).join(" · ");
  return String(v);
}

export default function PhonesPage() {
  const { data, refresh } = usePoll<Data>("/api/admin/phones", 3000);
  const { data: status } = usePoll<StatusResponse>("/api/status", 20000);
  const [filter, setFilter] = useState<Filter>("all");
  const [selId, setSelId] = useState<number | null>(null);
  const [dispatch, setDispatch] = useState<DispatchTarget | null>(null);
  const [person, setPerson] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const list = useMemo(() => (data?.sessions ?? []).filter((s) => match(s, filter)), [data, filter]);
  useEffect(() => {
    if (selId == null && data?.sessions.length) setSelId((data.sessions.find((s) => s.outcome && NEEDS.has(s.outcome)) ?? data.sessions[0]).id);
  }, [data, selId]);
  const sel = data?.sessions.find((s) => s.id === selId) ?? null;
  const loc: LatLng | null = sel ? (sel.ticket?.p?.[0] != null ? sel.ticket.p : sel.detail.lat != null ? [sel.detail.lat, sel.detail.lng] : sel.person?.home ?? null) : null;

  const callBack = async (userId: number, level: Level | null) => {
    setNote(null);
    try {
      await api("/api/admin/outreach", { body: { action: "call", userId, kind: level === "red" ? "evacuate" : "warning" } });
      setNote("Call placed: their phone is ringing now.");
      refresh();
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  const k = data?.kpi;
  return (
    <AdminShell title="Feature phones" sub={`Answers from people without smartphones: USSD ${USSD_CODE} and voice-call keypad replies, with every screen and key press`}>
      {!data || !k ? (
        <Loader2 className="animate-spin text-mute" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {[
              ["Sessions", k.sessions, "#3cc7f5"], ["Phone numbers", k.numbers, "#3cc7f5"], ["Live now", k.live, "#3cc7f5"], ["Safe / leaving", k.safe, "#22c55e"],
              ["Asked for help", k.help, "#ef4444"], ["Hazard reports", k.reports, "#f97316"], ["Registered by USSD", k.registered, "#a78bfa"], ["Dropped", k.dropped, "#8b9db0"],
            ].map(([l, v, c]) => (
              <div key={l as string} className="panel px-3 py-2.5">
                <div className="text-[11px] text-mute">{l}</div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: c as string }}>{v}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 [&>*]:min-w-0">
            {/* Session feed */}
            <section className="panel flex flex-col overflow-hidden xl:col-span-4 xl:h-[780px]">
              <div className="border-b border-line p-3">
                <div className="flex flex-wrap gap-1">
                  {FILTERS.map((f) => (
                    <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === f.id ? "bg-brand/20 text-brand" : "bg-white/[.04] text-mute hover:text-fg"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-dim">Updates every 3 seconds · average session {k.avgSec}s</div>
              </div>
              <ul className="flex-1 divide-y divide-line overflow-y-auto thin-scroll">
                {list.length === 0 && <li className="p-4 text-sm text-mute">Nothing here yet. Open the <a href="/phone" target="_blank" className="text-brand hover:underline">feature phone</a> and dial {USSD_CODE}.</li>}
                {list.map((s) => {
                  const tn = tone(s);
                  return (
                    <li key={s.id}>
                      <button onClick={() => setSelId(s.id)} className={`flex w-full gap-3 px-3 py-2.5 text-left transition ${s.id === selId ? "bg-brand/10" : "hover:bg-white/[.03]"}`}>
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${tn.c}22`, color: tn.c }}>
                          {s.channel === "ussd" ? <Hash size={15} /> : <PhoneIncoming size={15} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{s.person?.name ?? "Unregistered"}</span>
                            <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold" style={{ color: tn.c }}>
                              {s.status === "live" && <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full" style={{ background: tn.c }} />}
                              {tn.t}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-fg/80">{s.label}</span>
                          <span className="block text-[11px] text-dim">{s.channel === "ussd" ? "USSD" : "Voice keypad"} · {s.phone} · {s.person?.area ?? "area unknown"} · {timeAgo(s.updatedAt)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Detail */}
            <section className="space-y-4 xl:col-span-8">
              {!sel ? (
                <div className="panel p-6 text-sm text-mute">Choose a session.</div>
              ) : (
                <>
                  <div className="panel p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="label">{sel.channel === "ussd" ? `USSD session · ${sel.serviceCode}` : "Voice call · keypad answers"}</div>
                        <h2 className="text-xl font-semibold">{sel.person?.name ?? "Unregistered caller"}</h2>
                        <div className="text-sm text-mute">
                          {sel.phone} · {sel.lang} menus · started {clock(sel.startedAt)} · {sel.durationSec}s · {sel.steps.length} steps
                          {sel.network ? ` · network ${sel.network.slice(0, 3)}-${sel.network.slice(3)}` : ""} · {sel.origin === "gateway" ? "real gateway" : "demo simulator"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sel.person && (
                          <button className="btn btn-primary !py-1.5 text-xs" onClick={() => callBack(sel.person!.id, sel.person!.level)}>
                            <PhoneCall size={13} /> Call back
                          </button>
                        )}
                        {sel.person && loc && (
                          <button
                            className="btn btn-danger !py-1.5 text-xs"
                            onClick={() =>
                              setDispatch(
                                sel.ticket && sel.ticket.status !== "resolved"
                                  ? { ticketId: sel.ticket.id, ref: sel.ticket.ref, type: sel.ticket.type, p: loc, name: sel.person!.name }
                                  : { type: sel.person!.vulnerable ? "welfare" : "rescue", p: loc, name: sel.person!.name, createFor: { userId: sel.person!.id } },
                              )
                            }
                          >
                            <Siren size={13} /> {sel.ticket && sel.ticket.status === "received" ? "Dispatch" : "Send help"}
                          </button>
                        )}
                        {sel.person && (
                          <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => setPerson(sel.person!.id)}>
                            <UserRound size={13} /> Profile
                          </button>
                        )}
                      </div>
                    </div>
                    {note && <div className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs">{note}</div>}
                    <div className="mt-3 rounded-xl border px-3 py-2.5" style={{ borderColor: `${tone(sel).c}66`, background: `${tone(sel).c}12` }}>
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: tone(sel).c }}>Outcome</div>
                      <div className="font-semibold">{sel.label}</div>
                      {sel.ticket && (
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/85">
                          <span><b>{sel.ticket.ref}</b> · {sel.ticket.typeLabel}</span>
                          <span style={{ color: PRIORITY_COLOR[sel.ticket.priority] }}>{sel.ticket.priority}</span>
                          <span>{sel.ticket.people} {sel.ticket.people === 1 ? "person" : "people"}</span>
                          <span>{sel.ticket.statusLabel}{sel.ticket.team ? ` · ${sel.ticket.team}` : ""}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
                    <div className="panel p-4">
                      <div className="label mb-2 flex items-center gap-1.5"><Activity size={12} /> Feedback captured</div>
                      <dl className="divide-y divide-line rounded-xl border border-line text-sm">
                        {Object.entries(sel.detail).filter(([key, v]) => !HIDE.has(key) && v !== null && v !== "").map(([key, v]) => (
                          <div key={key} className="flex gap-3 px-3 py-1.5">
                            <dt className="w-36 shrink-0 text-mute">{KEY_LABEL[key] ?? key}</dt>
                            <dd className="min-w-0 flex-1 break-words">{fmt(v)}</dd>
                          </div>
                        ))}
                        {!Object.keys(sel.detail).filter((x) => !HIDE.has(x)).length && <div className="px-3 py-2 text-mute">No answers yet.</div>}
                      </dl>
                      {sel.ticket?.note && (
                        <div className="mt-3 rounded-lg bg-white/[.03] p-2.5 text-xs text-fg/80">
                          <div className="label mb-1">Request notes (all channels)</div>
                          {sel.ticket.note}
                        </div>
                      )}
                    </div>
                    <div className="panel p-4">
                      <div className="label mb-2 flex items-center gap-1.5"><Users size={12} /> Person</div>
                      {sel.person ? (
                        <dl className="space-y-1.5 text-sm">
                          {[
                            ["Home", `${sel.person.address}`],
                            ["Area risk", sel.person.level ? <span key="l" style={{ color: LEVEL_META[sel.person.level].color }}>{sel.person.area}: {sel.person.category}</span> : "—"],
                            ["Language", sel.person.language],
                            ["Vulnerable", sel.person.vulnerable ? sel.person.vulnerable.replace(/,/g, ", ") : "No"],
                            ["Medical", sel.person.medical || "—"],
                            ["Emergency contact", sel.person.emergency || "—"],
                            ["Family who follow them", sel.person.family.length ? sel.person.family.join(", ") : "—"],
                            ["Phone type", sel.person.channel === "ussd" ? "Basic phone (USSD, SMS, voice)" : "Smartphone app + phone"],
                          ].map(([a, b]) => (
                            <div key={a as string} className="flex gap-3"><dt className="w-36 shrink-0 text-mute">{a}</dt><dd className="min-w-0 flex-1">{b}</dd></div>
                          ))}
                        </dl>
                      ) : (
                        <div className="text-sm text-mute">Not registered (session ended before registration).</div>
                      )}
                      {loc && (
                        <div className="mt-3">
                          <div className="label mb-1 flex items-center gap-1.5"><MapPin size={12} /> From where</div>
                          <div className="h-[170px] overflow-hidden rounded-xl border border-line">
                            {status?.snap && (
                              <StormMap
                                snap={status.snap}
                                layers={{ ...DEFAULT_LAYERS, labels: false, gauges: false, storm: false, reports: false, evac: false, flow: false, closures: false }}
                                tickets={[{ id: sel.id, p: loc, ref: sel.ticket?.ref ?? sel.phone, label: sel.label, status: sel.ticket?.status ?? "received", name: sel.person?.name ?? sel.phone }]}
                                focus={{ p: loc, zoom: 14, key: sel.id }}
                              />
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-dim">
                            {loc[0].toFixed(4)}, {loc[1].toFixed(4)} · {sel.detail.location ?? (sel.channel === "ussd" ? "registered address (USSD has no GPS)" : "registered address")} ·{" "}
                            <a className="text-brand hover:underline" href={`https://maps.google.com/?q=${loc[0]},${loc[1]}`} target="_blank" rel="noreferrer">Google Maps</a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="panel p-4">
                    <div className="label mb-3 flex items-center gap-1.5"><Clock size={12} /> Full transcript</div>
                    <ol className="space-y-2.5">
                      {sel.steps.map((st, i) => {
                        const dt = i ? Math.round((new Date(st.at).getTime() - new Date(sel.steps[i - 1].at).getTime()) / 1000) : 0;
                        return (
                          <li key={i} className="grid grid-cols-[64px_1fr] gap-3">
                            <div className="pt-1 text-right font-mono text-[11px] text-dim">
                              {clock(st.at)}
                              {i > 0 && <div>+{dt}s</div>}
                            </div>
                            <div className="space-y-1.5">
                              {st.in != null && (
                                <div className="flex justify-end">
                                  <span className="rounded-2xl rounded-br-sm bg-brand/20 px-3 py-1 font-mono text-sm text-brand">
                                    {st.in === "" ? "(dial)" : st.in}
                                  </span>
                                </div>
                              )}
                              {st.in == null && sel.channel === "ussd" && (
                                <div className="flex justify-end"><span className="rounded-2xl rounded-br-sm bg-brand/20 px-3 py-1 font-mono text-sm text-brand">dialled {sel.serviceCode}</span></div>
                              )}
                              <div className={`max-w-[520px] whitespace-pre-wrap rounded-xl border px-3 py-2 font-mono text-[12px] leading-snug ${st.end ? "border-safe/40 bg-safe/[.06]" : "border-line2 bg-[#c9dcae]/[.06]"}`}>
                                <div className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-dim">{st.screenLabel}{st.end ? " · session ended" : ""}</div>
                                {st.out}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    {sel.status === "timed_out" && <div className="mt-3 text-xs text-mute">The caller stopped responding here (network drop or hung up). Consider a call back.</div>}
                  </div>
                </>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 [&>*]:min-w-0">
            <section className="panel overflow-x-auto p-4 xl:col-span-8">
              <div className="label mb-2 flex items-center gap-1.5"><Smartphone size={12} /> People on basic phones ({data.users.length})</div>
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-dim">
                  <tr><th className="py-1.5 pr-3">Name</th><th className="pr-3">Number</th><th className="pr-3">Area</th><th className="pr-3">Language</th><th className="pr-3">Vulnerable</th><th className="pr-3">Status</th><th>Last USSD</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.users.map((u) => (
                    <tr key={u.id} className="cursor-pointer hover:bg-white/[.03]" onClick={() => setPerson(u.id)}>
                      <td className="py-1.5 pr-3 font-medium">{u.name}</td>
                      <td className="pr-3 font-mono text-xs">{u.phone}</td>
                      <td className="pr-3">{u.area ?? "—"}</td>
                      <td className="pr-3">{u.language}</td>
                      <td className="pr-3">{u.vulnerable ? u.vulnerable.replace(/,/g, ", ") : "—"}</td>
                      <td className="pr-3" style={{ color: u.status ? CHECK_META[u.status as CheckStatus]?.color : undefined }}>{u.status ? CHECK_META[u.status as CheckStatus]?.label ?? u.status : <span className="text-dim">No response</span>}</td>
                      <td className="text-xs text-mute">{u.last ? timeAgo(u.last) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel p-4 text-sm xl:col-span-4">
              <div className="label mb-2 flex items-center gap-1.5"><Cable size={12} /> Connecting a real network</div>
              <p className="text-fg/85">The service already speaks the standard USSD gateway format (Africa&apos;s Talking style). To go live, rent a short code from an aggregator and point its callback at:</p>
              <code className="mt-2 block break-all rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-xs">POST {typeof window !== "undefined" ? window.location.origin : ""}/api/ussd</code>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-mute">
                <li>Fields: sessionId, serviceCode, phoneNumber, text (answers joined by *), networkCode. Reply starts with CON (continue) or END.</li>
                <li>Set <span className="font-mono">USSD_SHARED_SECRET</span> and send it as the <span className="font-mono">x-ussd-secret</span> header; without it only demo numbers are accepted.</li>
                <li>Ask networks to zero-rate (reverse-bill) the code so it is free for residents.</li>
                <li>USSD gives no GPS: location comes from the registered address or a typed landmark. Cell-tower location needs a network agreement.</li>
              </ul>
            </section>
          </div>
        </>
      )}
      <DispatchModal target={dispatch} onClose={() => setDispatch(null)} onDone={() => { setNote("Emergency services requested."); refresh(); }} />
      <PersonDrawer userId={person} onClose={() => setPerson(null)} onChange={refresh} />
    </AdminShell>
  );
}
