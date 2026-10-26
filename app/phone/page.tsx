"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CheckCircle2, Hash, Loader2, PhoneIncoming, Plus, Radio, ShieldAlert, Smartphone, Volume2, VolumeX, Waves } from "lucide-react";
import FeaturePhone, { type CallView, type PhoneData } from "@/components/phone/FeaturePhone";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/client";
import { EMERGENCY_LINES, USSD_CODE } from "@/lib/emergency";
import { LEVEL_META, CHECK_META, type CheckStatus } from "@/lib/risk";
import { clock, timeAgo } from "@/lib/format";

type Sim = { phone: string; name: string; area: string | null; note: string; featured: boolean };
const GOGO = "+27831110002";

function loadNewSim() {
  try {
    return localStorage.getItem("ss-new-sim");
  } catch {
    return null;
  }
}

export default function PhonePage() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [msisdn, setMsisdn] = useState(GOGO);
  const [newSim, setNewSim] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const [speak, setSpeak] = useState(false);
  const [call, setCall] = useState<CallView | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, refresh } = usePoll<PhoneData>(`/api/phone?msisdn=${encodeURIComponent(msisdn)}`, 2000);

  const loadSims = useCallback(() => {
    api<{ sims: Sim[] }>("/api/phone/sims").then((r) => setSims(r.sims)).catch(() => {});
  }, []);
  useEffect(() => {
    loadSims();
    setNewSim(loadNewSim());
  }, [loadSims]);
  useEffect(() => {
    if (data?.subscriber && !sims.some((s) => s.phone === data.phone)) loadSims();
  }, [data?.subscriber, data?.phone, sims, loadSims]);

  const freshSim = () => {
    const n = `+27790${String(Math.floor(100000 + Math.random() * 899999))}`;
    try {
      localStorage.setItem("ss-new-sim", n);
    } catch {
      /* ignore */
    }
    setNewSim(n);
    setMsisdn(n);
  };

  const callMe = async () => {
    setBusy(true);
    setNote(null);
    try {
      await api("/api/phone", { body: { msisdn, action: "call_me" } });
      setNote("StormShield will call this phone in about 3 seconds.");
      setTimeout(refresh, 3500);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onCall = useCallback((c: CallView | null) => setCall(c), []);
  const sub = data?.subscriber;
  const last = data?.sessions[0];
  const simList: Sim[] = [...sims];
  if (newSim && !simList.some((s) => s.phone === newSim)) simList.push({ phone: newSim, name: "New SIM", area: null, note: "Not registered yet: dial the code and press 1 to register", featured: false });

  return (
    <main className="mx-auto max-w-[1400px] space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label flex items-center gap-1.5"><Smartphone size={12} /> No smartphone, no data, no app</div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Feature phone &amp; USSD</h1>
          <p className="max-w-2xl text-sm text-mute">
            Many people in rural and informal areas use basic phones. StormShield reaches them by <b className="text-fg">voice call</b> and <b className="text-fg">SMS</b>, and they reply by keypad or by dialling <b className="font-mono text-brand">{USSD_CODE}</b> (free). Every answer lands in the command centre straight away.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => setSound((s) => !s)} aria-pressed={sound}>
            {sound ? <Volume2 size={14} /> : <VolumeX size={14} />} {sound ? "Sound on" : "Sound off"}
          </button>
          <button className={`btn !py-1.5 text-xs ${speak ? "btn-primary" : "btn-ghost"}`} onClick={() => setSpeak((s) => !s)} aria-pressed={speak}>
            <Waves size={14} /> Read calls aloud
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_340px_1fr] [&>*]:min-w-0">
        {/* SIM + controls */}
        <section className="space-y-3">
          <div className="panel p-4">
            <div className="label mb-2">SIM card in this phone</div>
            <div className="space-y-1.5">
              {simList.map((s) => (
                <button
                  key={s.phone}
                  onClick={() => setMsisdn(s.phone)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${msisdn === s.phone ? "border-brand/60 bg-brand/10" : "border-line2 bg-white/[.02] hover:bg-white/[.05]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{s.name}</span>
                    {s.featured && <span className="rounded bg-brand/20 px-1.5 text-[10px] font-bold text-brand">START HERE</span>}
                  </div>
                  <div className="font-mono text-[11px] text-mute">{s.phone}{s.area ? ` · ${s.area}` : ""}</div>
                  <div className="text-[11px] text-dim">{s.note}</div>
                </button>
              ))}
              <button onClick={freshSim} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-line2 px-3 py-2 text-left text-sm text-mute hover:text-fg">
                <Plus size={14} /> New unregistered SIM
              </button>
            </div>
          </div>

          <div className="panel p-4">
            <div className="label mb-2">Try it</div>
            <ol className="space-y-2 text-[13px] text-fg/85">
              <li className="flex gap-2"><Num n={1} /> <span>Dial <b className="font-mono">{USSD_CODE}</b> and press the green key (or type it and press Enter). Choose <b>1 I am safe</b> or <b>2 I need help</b>.</span></li>
              <li className="flex gap-2"><Num n={2} /> <span>
                Get the alert call:{" "}
                <button onClick={callMe} disabled={busy || !sub || !!data?.call} className="font-semibold text-brand hover:underline disabled:text-dim disabled:no-underline">
                  {busy ? <Loader2 size={12} className="inline animate-spin" /> : null} ask StormShield to call this phone
                </button>
                . Answer, press 1–4, then answer the short follow-up questions.
              </span></li>
              <li className="flex gap-2"><Num n={3} /> <span>Open the inbox (right soft key). Every SMS ends with the emergency numbers.</span></li>
              <li className="flex gap-2"><Num n={4} /> <span>See it arrive: <Link href="/admin/phones" className="text-brand hover:underline">Command centre → Feature phones</Link> (sign in as Selemani, 1234). Thandi&apos;s dashboard shows Gogo&apos;s status too.</span></li>
            </ol>
            {note && <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs">{note}</div>}
            <div className="mt-3 text-[11px] text-dim">Keyboard works too: digits, * #, Enter = send, Esc = end, ↑↓ scroll. In text screens type letters, or press # for multi-tap (abc).</div>
          </div>
        </section>

        {/* Phone */}
        <section className="order-first flex flex-col items-center gap-3 lg:order-none">
          {error && <div className="w-full rounded-lg bg-danger/15 px-3 py-2 text-xs text-red-300">{error.message}</div>}
          <FeaturePhone msisdn={msisdn} data={data && data.phone === msisdn ? data : null} refresh={refresh} sound={sound} speak={speak} onCall={onCall} />
          {call && call.stage !== "incoming" && (
            <div className="panel w-full max-w-[340px] p-3 text-[13px]">
              <div className="label mb-1 flex items-center gap-1.5"><PhoneIncoming size={12} /> What the caller hears</div>
              {call.stage === "menu" && (
                <>
                  <p>{call.english ? call.script.english : call.script.local}</p>
                  {!call.english && <p className="mt-1.5 text-xs text-mute">{call.script.english}</p>}
                </>
              )}
              {call.stage === "question" && (
                <>
                  <p>{call.question?.text}</p>
                  {call.question?.text !== call.question?.english && <p className="mt-1.5 text-xs text-mute">{call.question?.english}</p>}
                </>
              )}
              {call.stage === "done" && <p>{call.goodbye}</p>}
            </div>
          )}
          {data?.nextCallAt && !data.call && (
            <div className="text-xs text-mute">
              <BellRing size={12} className="mr-1 inline" /> Next StormShield call {new Date(data.nextCallAt).getTime() <= Date.now() ? "now" : `in ${Math.max(1, Math.round((new Date(data.nextCallAt).getTime() - Date.now()) / 1000))} s`}
            </div>
          )}
        </section>

        {/* What the command centre sees */}
        <section className="space-y-3">
          <div className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="label flex items-center gap-1.5"><Radio size={12} className="text-brand" /> What the command centre sees (live)</div>
              <Link href="/admin/phones" className="flex items-center gap-1 text-xs text-brand hover:underline">Open <ArrowRight size={12} /></Link>
            </div>
            {!data ? (
              <Loader2 className="animate-spin text-mute" size={16} />
            ) : !sub ? (
              <div className="text-sm text-mute">
                <b className="text-fg">{data.phone}</b> is not registered. Dial {USSD_CODE} and choose <b>1 Register</b>: name, area, language and consent take about 30 seconds. If the area is at high risk, StormShield calls straight away.
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{sub.name}</div>
                    <div className="text-xs text-mute">{data.phone} · {sub.address} · {sub.language}{sub.vulnerable ? ` · ${sub.vulnerable.replace(/,/g, ", ")}` : ""}</div>
                  </div>
                  {sub.level && (
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: LEVEL_META[sub.level].soft, color: LEVEL_META[sub.level].color }}>
                      {sub.area}: {sub.category} ({sub.score})
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-line2 p-2.5">
                    <div className="label">Latest status</div>
                    {sub.checkin ? (
                      <>
                        <div className="font-semibold" style={{ color: CHECK_META[sub.checkin.status as CheckStatus]?.color }}>{CHECK_META[sub.checkin.status as CheckStatus]?.label ?? sub.checkin.status}</div>
                        <div className="text-[11px] text-mute">{timeAgo(sub.checkin.created_at)}{sub.checkin.note ? ` · ${sub.checkin.note}` : ""}</div>
                      </>
                    ) : (
                      <div className="text-mute">No response yet</div>
                    )}
                  </div>
                  <div className="rounded-xl border border-line2 p-2.5">
                    <div className="label">Family who can see this</div>
                    <div>{sub.watchers.length ? sub.watchers.join(", ") : <span className="text-mute">None linked</span>}</div>
                  </div>
                </div>
                {data.tickets.length > 0 && (
                  <div>
                    <div className="label mb-1">Help requests</div>
                    <div className="space-y-1">
                      {data.tickets.map((t) => (
                        <div key={t.ref} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[.03] px-2.5 py-1.5 text-xs">
                          <span><b>{t.ref}</b> · {t.type} · {t.people} {t.people === 1 ? "person" : "people"} · <span className={t.priority === "urgent" ? "text-danger" : t.priority === "high" ? "text-warn" : "text-mute"}>{t.priority}</span></span>
                          <span className="text-mute">{t.status}{t.team ? ` · ${t.team}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="panel p-4">
            <div className="label mb-2 flex items-center gap-1.5"><Hash size={12} /> Session log for this number</div>
            {!data?.sessions.length ? (
              <div className="text-sm text-mute">Nothing yet. Dial {USSD_CODE} or answer a call.</div>
            ) : (
              <div className="space-y-3">
                {data.sessions.slice(0, 4).map((s, i) => (
                  <div key={s.id} className={`rounded-xl border ${i === 0 ? "border-brand/40" : "border-line2"} p-2.5`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold">{s.channel === "ussd" ? `USSD ${USSD_CODE}` : "Voice call keypad"} · {clock(s.startedAt)}</span>
                      <span className={s.endedAt ? "text-safe" : "text-warn"}>{s.label ?? (s.endedAt ? "Ended" : "In progress…")}</span>
                    </div>
                    {i === 0 && (
                      <ol className="mt-2 space-y-1 border-l border-line2 pl-3 text-[11.5px]">
                        {s.steps.map((st, k) => (
                          <li key={k}>
                            {st.in != null && <span className="mr-1 rounded bg-brand/15 px-1 font-mono text-brand">{st.in || "dial"}</span>}
                            <span className="whitespace-pre-line text-fg/75">{st.out.length > 160 ? `${st.out.slice(0, 160)}…` : st.out}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            )}
            {last && <div className="mt-2 text-[11px] text-dim">Admins see every screen and key press with timestamps, plus the help request, location and who was notified.</div>}
          </div>

          <div className="panel p-4">
            <div className="label mb-2 flex items-center gap-1.5"><ShieldAlert size={12} /> Added to the bottom of every SMS</div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {EMERGENCY_LINES.map((l) => (
                <div key={l.number} className="rounded-lg bg-white/[.03] px-2.5 py-1.5"><div className="font-mono text-sm font-semibold">{l.number}</div><div className="text-mute">{l.label}</div></div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-dim"><CheckCircle2 size={12} /> 112 works from any mobile, free, even without airtime.</div>
          </div>
        </section>
      </div>
    </main>
  );
}

const Num = ({ n }: { n: number }) => <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">{n}</span>;
