"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Accessibility, Activity, AlertOctagon, BellRing, Brain, CheckCircle2, Clock, FastForward, Loader2, MapPinned, Megaphone, Pause, PhoneCall, PhoneMissed, Play,
  Radio, RotateCcw, Send, Siren, Tent, Truck, Users,
} from "lucide-react";
import { StormMap, DEFAULT_LAYERS } from "@/components/map";
import { Empty, LevelDot, LevelPill, PanelHead } from "@/components/ui";
import AdminShell from "@/components/admin/Shell";
import DispatchModal, { type DispatchTarget } from "@/components/admin/DispatchModal";
import PersonDrawer from "@/components/admin/PersonDrawer";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/client";
import type { Snapshot, ZoneState } from "@/lib/engine";
import type { EventInfo } from "@/lib/types";
import type { UnitRow } from "@/lib/dispatch";
import { ZONES, ZONE_BY_ID, type Hazard, type LatLng } from "@/lib/geo";
import { CHECK_META, HAZARD_LABEL, LEVEL_META, PRIORITY_COLOR, TICKET_SOURCE_LABEL, TICKET_STATUS_LABEL, TICKET_TYPES, type CheckStatus, type Level, type TicketStatus, type TicketType } from "@/lib/risk";
import { alertText } from "@/lib/i18n";
import { drillClock, inHours, timeAgo } from "@/lib/format";

interface Resident {
  id: number; name: string; phone: string; address: string; language: string; p: LatLng; zoneId: string | null; zoneName: string | null;
  level: Level | null; vulnerable: string[]; medical: boolean; status: string | null; statusAt: string | null; emergency: string; risk: number;
}
interface Ticket {
  id: number; ref: string; type: string; note: string | null; people: number; p: LatLng; status: string; team: string | null; createdAt: string; updatedAt: string;
  name: string; phone: string; vulnerable: string[]; medical: string | null; zoneName: string | null; level: Level | null;
  unitId: string | null; etaAt: string | null; priority: string; source: string;
}
interface OutreachTarget {
  id: number; userId: number; status: string; attempts: number; name: string; phone: string; vulnerable: string[]; zone: string | null; emergency: string;
  medical: boolean; ticketId: number | null; updatedAt: string; p: LatLng; nextAt: string; result: string | null;
}
interface Overview {
  event: EventInfo;
  snap: Snapshot;
  kpi: {
    residents: number; inRed: number; inOrange: number; vulnerableInDanger: number; safe: number; evacuating: number; needHelp: number; vulnerablePresent: number;
    noResponse: number; openTickets: number; teamsNeeded: number; alerts: number; messages: Record<string, number>; affected: number;
  };
  residents: Resident[];
  callList: Resident[];
  tickets: Ticket[];
  units: UnitRow[];
  outreach: { stats: { total: number; reached: number; unreached: number; ringing: number; queued: number }; unreached: OutreachTarget[]; live: OutreachTarget[] };
  zones: (ZoneState & { residents: number; safe: number; help: number; pending: number; vulnerable: number; affected: number })[];
  shelters: { id: string; name: string; type: string; capacity: number; open: boolean; demand: number; zoneId: string | null }[];
  activity: { kind: string; label: string; name: string; zone: string | null; at: string }[];
}

type Tab = "queue" | "unreached" | "areas" | "broadcast";

export default function Admin() {
  const { data, refresh } = usePoll<Overview>("/api/admin/overview", 6000);
  const [tab, setTab] = useState<Tab>("queue");
  const [focus, setFocus] = useState<{ p: LatLng; zoom?: number; key?: number } | null>(null);
  const [show, setShow] = useState({ people: true, tickets: true, units: true });
  const [dispatch, setDispatch] = useState<DispatchTarget | null>(null);
  const [person, setPerson] = useState<number | null>(null);

  if (!data) {
    return (
      <AdminShell title="Command centre">
        <div className="grid min-h-[50vh] place-items-center text-mute">
          <Loader2 className="animate-spin" />
        </div>
      </AdminShell>
    );
  }
  const { kpi } = data;
  const fly = (p: LatLng) => setFocus({ p, zoom: 15, key: Date.now() });
  const deployed = data.units.filter((u) => u.status !== "available").length;
  const os = data.outreach.stats;

  return (
    <AdminShell title="Command centre" sub={`eThekwini Disaster Management · ${data.event.title}`} actions={<EventControls event={data.event} onChange={refresh} />}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Kpi icon={Users} label="Registered" value={kpi.residents} />
        <Kpi icon={AlertOctagon} label="In extreme zones" value={kpi.inRed} color={LEVEL_META.red.color} sub={`${kpi.inOrange} more in high-risk zones`} />
        <Kpi icon={Accessibility} label="Vulnerable at risk" value={kpi.vulnerableInDanger} color="#a78bfa" />
        <Kpi icon={CheckCircle2} label="Safe / evacuating" value={`${kpi.safe} / ${kpi.evacuating}`} color="#22c55e" />
        <Kpi icon={PhoneCall} label="Reached by phone" value={`${os.reached}/${os.total}`} color="#3cc7f5" sub={`${os.ringing} ringing · ${os.queued} queued`} />
        <Kpi icon={PhoneMissed} label="Unreached (3 calls)" value={os.unreached} color={os.unreached ? "#fbbf24" : undefined} sub="family notified" />
        <Kpi icon={Siren} label="Open help requests" value={kpi.openTickets} color={kpi.openTickets ? "#ef4444" : undefined} sub={`${data.tickets.filter((t) => t.status === "received").length} waiting for a unit`} />
        <Kpi icon={Truck} label="Units deployed" value={`${deployed}/${data.units.length}`} sub={`${data.units.length - deployed} available`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 [&>*]:min-w-0">
        <section className="relative h-[60dvh] min-h-[440px] overflow-hidden rounded-2xl border border-line xl:col-span-8 xl:h-[680px]">
          <StormMap
            snap={data.snap}
            layers={{ ...DEFAULT_LAYERS, labels: true, police: true, fire: true, gauges: true }}
            people={show.people ? data.residents.map((r) => ({ id: r.id, p: r.p, name: r.name, status: r.status, vulnerable: r.vulnerable, sub: `${r.zoneName ?? ""} · ${r.phone}` })) : undefined}
            tickets={show.tickets ? data.tickets.filter((t) => t.status !== "resolved").map((t) => ({ id: t.id, p: t.p, ref: t.ref, label: TICKET_TYPES[t.type as TicketType] ?? t.type, status: t.status, name: t.name })) : undefined}
            units={show.units ? data.units : undefined}
            focus={focus}
            onZoneClick={(id) => {
              setTab("areas");
              setFocus({ p: ZONE_BY_ID[id].c, zoom: 13, key: Date.now() });
            }}
          />
          <div className="absolute left-3 top-3 z-[1000] flex gap-1 rounded-xl border border-line2 bg-bg/90 p-1 text-xs shadow-xl backdrop-blur">
            {(
              [
                ["people", "Residents"],
                ["tickets", "Help requests"],
                ["units", "Units"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))} className={`rounded-lg px-2.5 py-1 font-medium ${show[k] ? "bg-white/10 text-fg" : "text-dim"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="absolute bottom-3 left-3 z-[1000] rounded-xl border border-line2 bg-bg/90 p-2.5 text-[11px] shadow-xl backdrop-blur">
            {(Object.keys(CHECK_META) as CheckStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHECK_META[s].color }} />
                {CHECK_META[s].label}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#8b9db0]" /> No response
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-violet" /> Vulnerable
            </div>
            <div className="flex items-center gap-2">
              <Truck size={11} className="text-brand" /> Response unit
            </div>
          </div>
        </section>

        <section className="panel flex min-h-[440px] flex-col overflow-hidden xl:col-span-4 xl:h-[680px]">
          <div className="flex border-b border-line">
            {(
              [
                ["queue", `Help (${kpi.openTickets})`, Siren],
                ["unreached", `Unreached (${os.unreached})`, PhoneMissed],
                ["areas", "Areas", MapPinned],
                ["broadcast", "Broadcast", Megaphone],
              ] as const
            ).map(([k, l, Icon]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-xs font-semibold transition ${tab === k ? "border-brand text-fg" : "border-transparent text-mute hover:text-fg"}`}>
                <Icon size={14} /> <span className="truncate">{l}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 thin-scroll">
            {tab === "queue" && <Queue tickets={data.tickets} onFocus={fly} onChange={refresh} onDispatch={setDispatch} onPerson={setPerson} />}
            {tab === "unreached" && <Unreached list={data.outreach.unreached} callList={data.callList} onFocus={fly} onChange={refresh} onDispatch={setDispatch} onPerson={setPerson} />}
            {tab === "areas" && <Areas zones={data.zones} onFocus={(id) => setFocus({ p: ZONE_BY_ID[id].c, zoom: 13, key: Date.now() })} />}
            {tab === "broadcast" && <Broadcast onSent={refresh} />}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="panel p-5 lg:col-span-7">
          <PanelHead icon={<Tent size={13} />} title="Shelter capacity forecast" sub={`Predicted arrivals from the flood model · ~${kpi.affected.toLocaleString("en-ZA")} people estimated in affected areas`} />
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {data.shelters
              .filter((s) => s.capacity)
              .sort((a, b) => b.demand / b.capacity - a.demand / a.capacity)
              .map((s) => {
                const pct = s.capacity ? Math.min(150, Math.round((s.demand / s.capacity) * 100)) : 0;
                const c = !s.open ? "#475569" : pct > 100 ? "#ef4444" : pct > 75 ? "#f97316" : "#22c55e";
                return (
                  <li key={s.id}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 font-mono text-xs tabular" style={{ color: c }}>
                        {s.open ? `${s.demand}/${s.capacity}` : "cut off"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[.06]">
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.open ? Math.min(100, pct) : 100}%`, background: c, opacity: s.open ? 1 : 0.35 }} />
                    </div>
                    {s.open && pct > 100 && <div className="mt-0.5 text-[10px] text-danger">Over capacity: open an overflow site</div>}
                  </li>
                );
              })}
          </ul>
        </div>
        <div className="panel p-5 lg:col-span-5">
          <PanelHead icon={<Activity size={13} />} title="Live activity" />
          <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1 thin-scroll">
            {data.activity.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: a.kind === "ticket" ? "#ef4444" : a.kind === "report" ? "#facc15" : CHECK_META[a.label as CheckStatus]?.color ?? "#8b9db0" }}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-fg/90">
                    {a.kind === "checkin" && (
                      <>
                        <b className="font-semibold">{a.name}</b>: {CHECK_META[a.label as CheckStatus]?.label ?? a.label}
                      </>
                    )}
                    {a.kind === "ticket" && (
                      <>
                        <b className="font-semibold text-red-300">Help request</b> from {a.name}: {TICKET_TYPES[a.label as TicketType] ?? a.label}
                      </>
                    )}
                    {a.kind === "report" && (
                      <>
                        <b className="font-semibold text-watch">Community report</b>: {a.name || a.label}
                      </>
                    )}
                  </span>
                  <div className="text-[11px] text-dim">
                    {a.zone ? ZONE_BY_ID[a.zone]?.name : ""} · {timeAgo(a.at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <DispatchModal target={dispatch} onClose={() => setDispatch(null)} onDone={refresh} />
      <PersonDrawer userId={person} onClose={() => setPerson(null)} onChange={refresh} />
    </AdminShell>
  );
}

function Kpi({ icon: Icon, label, value, color, sub }: { icon: React.ComponentType<{ size?: number }>; label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
        <Icon size={12} /> <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold tabular" style={{ color }}>
        {value}
      </div>
      {sub && <div className="truncate text-[10px] text-dim">{sub}</div>}
    </div>
  );
}

function EventControls({ event, onChange }: { event: EventInfo; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [hour, setHour] = useState(event.hour ?? 0);
  useEffect(() => {
    setHour(event.hour ?? 0);
  }, [event.hour]);
  const act = async (body: Record<string, unknown>, key: string) => {
    if (key === "restart" && !confirm("Start a new drill? Alerts, check-ins and tickets from this event will be archived.")) return;
    if (key === "live" && !confirm("Switch to live monitoring with real Open-Meteo data?")) return;
    setBusy(key);
    try {
      await api("/api/admin/event", { body });
      onChange();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  if (event.mode === "live") {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-safe/40 bg-safe/10 px-3 py-2 text-sm font-semibold text-safe">Live monitoring</span>
        <button className="btn btn-ghost !py-2 text-sm" onClick={() => act({ action: "restart", hour: 0 }, "restart")}>
          {busy === "restart" ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Start flood drill
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet/30 bg-violet/[.06] p-2">
      <div className="px-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-violet">Drill clock</div>
        <div className="font-mono text-lg font-semibold tabular">{drillClock(event.hour)}</div>
      </div>
      <div className="flex items-center gap-1">
        {event.speed > 0 ? (
          <button className="btn btn-ghost !px-2.5 !py-2" title="Pause" onClick={() => act({ action: "pause" }, "pause")}>
            <Pause size={16} />
          </button>
        ) : (
          <button className="btn btn-ghost !px-2.5 !py-2" title="Run in real time" onClick={() => act({ action: "play", speed: 1 }, "play")}>
            <Play size={16} />
          </button>
        )}
        {[30, 120].map((s) => (
          <button key={s} className={`btn !px-2.5 !py-2 text-xs ${event.speed === s ? "btn-primary" : "btn-ghost"}`} onClick={() => act({ action: "speed", speed: s }, `s${s}`)} title={`${s}× speed`}>
            <FastForward size={14} /> {s}×
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-1">
        <input type="range" min={-3} max={24} step={0.5} value={hour} onChange={(e) => setHour(Number(e.target.value))} onMouseUp={() => act({ action: "set_hour", hour }, "hour")} onTouchEnd={() => act({ action: "set_hour", hour }, "hour")} onKeyUp={() => act({ action: "set_hour", hour }, "hour")} className="w-36 accent-[#a78bfa]" aria-label="Set drill hour" />
        <span className="w-14 font-mono text-xs text-mute">{drillClock(hour)}</span>
      </div>
      <button className="btn btn-ghost !py-2 text-xs" onClick={() => act({ action: "restart", hour: 0 }, "restart")}>
        {busy === "restart" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restart
      </button>
      <button className="btn btn-ghost !py-2 text-xs" onClick={() => act({ action: "live" }, "live")}>
        <Radio size={14} /> Go live
      </button>
    </div>
  );
}

function Queue({ tickets, onFocus, onChange, onDispatch, onPerson }: { tickets: Ticket[]; onFocus: (p: LatLng) => void; onChange: () => void; onDispatch: (t: DispatchTarget) => void; onPerson: (id: number) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const list = tickets.filter((t) => filter === "all" || t.status !== "resolved");
  const act = async (t: Ticket, action: "arrive" | "resolve") => {
    setBusy(t.id);
    try {
      await api("/api/admin/dispatch", { body: { action, ticketId: t.id } });
      onChange();
    } finally {
      setBusy(null);
    }
  };
  void onPerson;
  return (
    <div>
      <div className="mb-3 flex gap-1 text-xs">
        {(["open", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-2.5 py-1 font-semibold capitalize ${filter === f ? "bg-white/10" : "text-mute"}`}>
            {f}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-dim">Urgent and unassigned first</span>
      </div>
      {list.length === 0 ? (
        <Empty>No open help requests.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id} className={`rounded-xl border p-3 ${t.status === "received" ? "border-danger/50 bg-danger/[.06]" : "border-line bg-black/20"}`}>
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => onFocus(t.p)} className="min-w-0 text-left">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] ?? "#8b9db0" }} title={`${t.priority} priority`} />
                    <span className="font-mono text-xs text-mute">{t.ref}</span> {TICKET_TYPES[t.type as TicketType] ?? t.type}
                  </div>
                  <div className="truncate text-xs text-mute">
                    {t.name} · {t.zoneName ?? "Unknown area"} · {t.people} {t.people > 1 ? "people" : "person"}
                  </div>
                </button>
                <span className="shrink-0 text-[11px] text-dim">{timeAgo(t.createdAt)}</span>
              </div>
              {t.note && <div className="mt-1.5 text-xs text-fg/80">“{t.note}”</div>}
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-mute">via {TICKET_SOURCE_LABEL[t.source] ?? t.source}</span>
                {t.level && <LevelPill level={t.level} />}
                {t.vulnerable.map((v) => (
                  <span key={v} className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-semibold text-violet">{v}</span>
                ))}
                {t.medical && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">medical: {t.medical}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold" style={{ color: t.status === "resolved" ? "#22c55e" : t.status === "received" ? "#ef4444" : "#facc15" }}>
                  {TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status}
                  {t.team ? ` · ${t.team}` : ""}
                  {t.status === "en_route" && t.etaAt ? ` · ETA ${Math.max(0, Math.ceil((new Date(t.etaAt).getTime() - Date.now()) / 60000))} min` : ""}
                </span>
                <span className="flex-1" />
                <a href={`tel:${t.phone}`} className="btn btn-ghost !px-2 !py-1 text-[11px]">
                  <PhoneCall size={12} /> Call
                </a>
                {t.status === "received" && (
                  <button className="btn btn-danger !px-2 !py-1 text-[11px]" onClick={() => onDispatch({ ticketId: t.id, ref: t.ref, type: t.type, p: t.p, name: t.name })}>
                    <Truck size={12} /> Dispatch
                  </button>
                )}
                {t.status === "en_route" && (
                  <button className="btn btn-ghost !px-2 !py-1 text-[11px]" disabled={busy === t.id} onClick={() => act(t, "arrive")}>
                    On scene
                  </button>
                )}
                {(t.status === "on_scene" || t.status === "en_route") && (
                  <button className="btn btn-primary !px-2 !py-1 text-[11px]" disabled={busy === t.id} onClick={() => act(t, "resolve")}>
                    {busy === t.id ? <Loader2 size={12} className="animate-spin" /> : null} Resolve
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Unreached({ list, callList, onFocus, onChange, onDispatch, onPerson }: {
  list: OutreachTarget[]; callList: Resident[]; onFocus: (p: LatLng) => void; onChange: () => void; onDispatch: (t: DispatchTarget) => void; onPerson: (id: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    try {
      await api("/api/admin/outreach", { body });
      onChange();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const sorted = [...list].sort((a, b) => b.vulnerable.length - a.vulnerable.length);
  return (
    <div>
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/[.06] p-3 text-xs text-fg/85">
        <PhoneMissed size={16} className="mt-0.5 shrink-0 text-warn" />
        <span>No answer after 3 automated calls. Their emergency contact has been called and sent an SMS. Vulnerable people already have an automatic welfare check.</span>
      </div>
      {sorted.length === 0 ? (
        <Empty>Everyone called has been reached.</Empty>
      ) : (
        <ul className="space-y-2">
          {sorted.map((t) => (
            <li key={t.id} className="rounded-xl border border-line bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => { onFocus(t.p); onPerson(t.userId); }}>
                  <div className="truncate text-sm font-semibold hover:underline">{t.name}</div>
                  <div className="truncate text-[11px] text-mute">{t.zone} · {t.phone}</div>
                </button>
                <span className="shrink-0 text-[11px] text-dim">{timeAgo(t.updatedAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {t.vulnerable.map((v) => (
                  <span key={v} className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-semibold text-violet">{v}</span>
                ))}
                {t.medical && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">medical</span>}
                {t.ticketId && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-mute">welfare check SS-{1000 + t.ticketId}</span>}
              </div>
              <div className="mt-1 text-[11px] text-dim">Emergency contact: {t.emergency}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button className="btn btn-ghost !px-2 !py-1 text-[11px]" disabled={!!busy} onClick={() => run(`c${t.id}`, { action: "call", userId: t.userId })}>
                  {busy === `c${t.id}` ? <Loader2 size={12} className="animate-spin" /> : <PhoneCall size={12} />} Call again
                </button>
                {!t.ticketId && (
                  <button className="btn btn-danger !px-2 !py-1 text-[11px]" onClick={() => onDispatch({ type: "welfare", p: t.p, name: t.name, createFor: { userId: t.userId, targetId: t.id } })}>
                    <Truck size={12} /> Send welfare check
                  </button>
                )}
                <button className="btn btn-ghost !px-2 !py-1 text-[11px]" disabled={!!busy} onClick={() => run(`r${t.id}`, { action: "reached", targetId: t.id, note: "Reached by staff" })}>
                  <CheckCircle2 size={12} /> Mark reached
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5">
        <div className="mb-2 flex items-start gap-2 text-xs text-mute">
          <Brain size={15} className="mt-0.5 shrink-0 text-brand" />
          Predicted need for help (not yet safe): flood level and depth, vulnerability, medical needs, and time silent.
        </div>
        <ol className="space-y-1.5">
          {callList.slice(0, 12).map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="w-4 font-mono text-[11px] text-dim">{i + 1}</span>
              <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => { onFocus(r.p); onPerson(r.id); }}>{r.name}</button>
              <span className="font-mono text-xs font-bold" style={{ color: r.risk > 0.6 ? "#ef4444" : r.risk > 0.35 ? "#f97316" : "#facc15" }}>{Math.round(r.risk * 100)}%</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Areas({ zones, onFocus }: { zones: Overview["zones"]; onFocus: (id: string) => void }) {
  const sorted = useMemo(() => [...zones].sort((a, b) => Math.max(b.score, b.peakScore) - Math.max(a.score, a.peakScore)), [zones]);
  return (
    <ul className="divide-y divide-line">
      {sorted.map((z) => (
        <li key={z.id}>
          <button onClick={() => onFocus(z.id)} className="w-full py-2.5 text-left hover:bg-white/[.02]">
            <div className="flex items-center gap-2">
              <LevelDot level={z.level} />
              <span className="flex-1 truncate text-sm font-semibold">{z.name}</span>
              <span className="font-mono text-xs tabular text-mute">{z.score}</span>
              <span className={`text-[11px] ${z.trend === "rising" ? "text-warn" : z.trend === "falling" ? "text-safe" : "text-dim"}`}>{z.trend === "rising" ? "▲" : z.trend === "falling" ? "▼" : "■"}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-[18px] text-[11px] text-mute">
              <span>
                <Clock size={10} className="mr-0.5 inline" />
                {z.level === "red" ? `peak ${inHours(z.peakIn)}` : z.redIn !== null ? `extreme ${inHours(z.redIn)}` : z.orangeIn !== null && z.level !== "orange" ? `high ${inHours(z.orangeIn)}` : "no escalation"}
              </span>
              {z.depthM > 0 && <span>{z.depthM} m</span>}
              <span>
                {z.residents} users · <span className="text-safe">{z.safe} ok</span> · <span className="text-watch">{z.pending} silent</span>
                {z.help ? <span className="text-danger"> · {z.help} help</span> : null}
              </span>
              {z.affected > 0 && <span>~{z.affected.toLocaleString("en-ZA")} affected</span>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Broadcast({ onSent }: { onSent: () => void }) {
  const [zoneId, setZoneId] = useState("");
  const [level, setLevel] = useState<Level>("orange");
  const [hazard, setHazard] = useState<Hazard>("flood");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const area = zoneId ? ZONE_BY_ID[zoneId].name : "eThekwini";
  const en = alertText("en", hazard, level, area, { custom: message || null });
  const zu = alertText("zu", hazard, level, area, { custom: message || null });
  const send = async (type: "alert" | "checkin") => {
    setBusy(type);
    setDone(null);
    try {
      await api("/api/admin/broadcast", { body: { type, zoneId, level, hazard, message } });
      setDone(type === "checkin" ? `Check-in request sent to ${area}.` : `Alert sent to ${area} by push${level === "orange" || level === "red" || message ? ", SMS" : ""}${level === "red" ? " and voice call" : ""}.`);
      setMessage("");
      onSent();
    } catch (e) {
      setDone((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-mute">
        Area
        <select className="input mt-1 text-sm" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="">Whole city (all residents)</option>
          {ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-mute">
          Hazard
          <select className="input mt-1 text-sm" value={hazard} onChange={(e) => setHazard(e.target.value as Hazard)}>
            {(Object.keys(HAZARD_LABEL) as Hazard[]).map((h) => (
              <option key={h} value={h}>
                {HAZARD_LABEL[h]}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs font-medium text-mute">
          Level
          <div className="mt-1 grid grid-cols-4 gap-1">
            {(["green", "yellow", "orange", "red"] as Level[]).map((l) => (
              <button key={l} onClick={() => setLevel(l)} className="h-[42px] rounded-lg border-2 transition" style={{ background: LEVEL_META[l].soft, borderColor: level === l ? LEVEL_META[l].color : "transparent" }} aria-label={LEVEL_META[l].label} aria-pressed={level === l}>
                <span className="mx-auto block h-3 w-3 rounded-full" style={{ background: LEVEL_META[l].color }} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="block text-xs font-medium text-mute">
        Custom message (optional, English)
        <textarea className="input mt-1 min-h-[70px] text-sm" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={320} placeholder="Leave empty to use the standard translated message for this level" />
      </label>
      <div className="rounded-xl border border-line bg-black/30 p-3 text-xs">
        <div className="mb-1 font-bold uppercase tracking-wider text-dim">Preview</div>
        <div className="font-semibold">{zu.title}</div>
        <div className="text-fg/85">{zu.body}</div>
        <div className="mt-1.5 border-t border-white/10 pt-1.5 text-mute">
          {en.title}. {en.body}
        </div>
        {message && <div className="mt-1 text-[10px] text-watch">Custom text is sent in English to every language group.</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => send("alert")} disabled={!!busy}>
          {busy === "alert" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send alert
        </button>
        <button className="btn btn-ghost" onClick={() => send("checkin")} disabled={!!busy}>
          {busy === "checkin" ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Request check-in
        </button>
      </div>
      {done && <div className="rise rounded-lg border border-safe/30 bg-safe/10 px-3 py-2 text-xs text-fg/90">{done}</div>}
    </div>
  );
}
