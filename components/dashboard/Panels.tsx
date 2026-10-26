"use client";
import { useMemo, useState } from "react";
import { SMS_FOOTER } from "@/lib/emergency";
import Link from "next/link";
import { BellRing, Building2, Car, Expand, Flame, Footprints, Hospital, Loader2, Megaphone, MessageSquareText, Navigation, PhoneCall, Send, ShieldCheck, Smartphone, Tent } from "lucide-react";
import { PLACES, PLACE_LABEL, distanceKm, travelEstimate, zoneAt, type LatLng, type PlaceType } from "@/lib/geo";
import type { Snapshot } from "@/lib/engine";
import type { MyAlert, MeResponse, ReportRow } from "@/lib/types";
import { LEVEL_META, REPORT_KINDS, rank, type ReportKind } from "@/lib/risk";
import { km, timeAgo } from "@/lib/format";
import { api, getPosition } from "@/lib/client";
import { Empty, LevelPill, PanelHead } from "../ui";
import { HAZARD_ICON } from "../panels";
import { StormMap } from "../map";
import { floodedPlaces } from "../map/model";

export function MiniMap({ snap, places, center, reports }: { snap: Snapshot | null; places: MeResponse["places"]; center: LatLng; reports?: ReportRow[] }) {
  const focus = useMemo(() => ({ p: center, zoom: 13, key: center.join(",") }), [center]);
  return (
    <Link href={`/map?lat=${center[0]}&lng=${center[1]}`} className="group relative block h-full min-h-[300px] overflow-hidden rounded-2xl border border-line" aria-label="Open full-screen map">
      <StormMap
        snap={snap}
        interactive={false}
        initialCenter={center}
        initialZoom={13}
        focus={focus}
        layers={{ labels: false, gauges: false, police: false, fire: false, hall: false }}
        places={places.map((p) => ({ p: p.p, label: p.label, kind: p.key as "home" | "work" | "gps" }))}
        reports={reports}
      />
      <div className="pointer-events-none absolute inset-0 z-[1000] bg-gradient-to-t from-bg/80 via-transparent to-transparent" />
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg bg-bg/85 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-mute">Your area</div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[1000] flex items-center justify-between">
        <div className="flex gap-1.5">
          {(["red", "orange", "yellow", "green"] as const).map((l) => (
            <span key={l} className="h-2 w-6 rounded-full" style={{ background: LEVEL_META[l].color }} />
          ))}
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-bold text-[#04121b] transition group-hover:brightness-110">
          <Expand size={13} /> Open full map
        </span>
      </div>
    </Link>
  );
}

export function AlertsFeed({ alerts, draft, languageName }: { alerts: MyAlert[]; draft: boolean; languageName: string }) {
  return (
    <div className="panel p-5">
      <PanelHead icon={<BellRing size={13} />} title="Active alerts" sub={`For your home and work · in ${languageName}${draft ? " + English" : ""}`} />
      {alerts.length === 0 ? (
        <Empty>No alerts for your areas. We&apos;ll notify you the moment that changes.</Empty>
      ) : (
        <ul className="max-h-[430px] space-y-2 overflow-y-auto pr-1 thin-scroll">
          {alerts.map((a, i) => {
            const Icon = HAZARD_ICON[a.hazard];
            const m = LEVEL_META[a.level];
            return (
              <li key={a.id} className={`rise rounded-xl border bg-black/20 p-3 ${i === 0 && rank(a.level) >= 2 && a.kind !== "eased" ? "" : "border-line"}`} style={i === 0 && rank(a.level) >= 2 && a.kind !== "eased" ? { borderColor: `${m.color}88`, background: m.soft } : undefined}>
                <div className="flex gap-3">
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: m.soft, color: m.color }}>
                    <Icon size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-snug">{a.local.title}</div>
                    <div className="mt-0.5 text-sm text-fg/90">{a.local.body}</div>
                    {draft && (
                      <div className="mt-1.5 border-l-2 border-line2 pl-2 text-xs text-mute">
                        <span className="font-semibold">English:</span> {a.english.title}. {a.english.body}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <LevelPill level={a.level}>{a.kind === "eased" ? "Easing" : a.kind === "broadcast" ? "Official notice" : m.label}</LevelPill>
                      <span className="text-[11px] text-dim">{timeAgo(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {draft && <p className="mt-2 text-[10px] text-dim">Translations are drafts awaiting native-speaker review.</p>}
    </div>
  );
}

const TABS: { t: PlaceType; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { t: "shelter", label: "Shelters", icon: Tent },
  { t: "hospital", label: "Hospitals", icon: Hospital },
  { t: "police", label: "Police", icon: ShieldCheck },
  { t: "fire", label: "Fire", icon: Flame },
  { t: "hall", label: "Halls", icon: Building2 },
];

export function ShelterLocator({ from, fromLabel, snap }: { from: LatLng; fromLabel: string; snap: Snapshot | null }) {
  const [tab, setTab] = useState<PlaceType>("shelter");
  const levels = useMemo(() => Object.fromEntries((snap?.zones ?? []).map((z) => [z.id, z.level])), [snap]);
  const flooded = useMemo(() => floodedPlaces(snap, 0), [snap]);
  const list = useMemo(() => {
    return PLACES.filter((p) => p.type === tab)
      .map((p) => {
        const d = distanceKm(from, p.p);
        const z = zoneAt(p.p);
        const lvl = z ? levels[z.id] : undefined;
        const closed = !!flooded[p.id];
        return { ...p, d, t: travelEstimate(d), closed, zoneName: z?.name, lvl };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
  }, [tab, from, levels]);
  const recommended = list.find((p) => !p.closed && (!p.lvl || rank(p.lvl) < 2))?.id ?? list.find((p) => !p.closed)?.id;
  return (
    <div className="panel p-5">
      <PanelHead icon={<Navigation size={13} />} title="Shelter locator" sub={`Nearest to ${fromLabel}`} />
      <div className="mb-3 flex gap-1 overflow-x-auto thin-scroll">
        {TABS.map((x) => (
          <button key={x.t} onClick={() => setTab(x.t)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${tab === x.t ? "bg-white/10 text-fg" : "text-mute hover:text-fg"}`}>
            <x.icon size={14} /> {x.label}
          </button>
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((p) => (
          <li key={p.id} className={`rounded-xl border p-3 ${p.id === recommended && tab === "shelter" ? "border-safe/50 bg-safe/[.06]" : "border-line bg-black/20"} ${p.closed ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="text-[11px] text-dim">
                  {PLACE_LABEL[p.type]}
                  {p.capacity ? ` · ${p.capacity} people` : ""}
                </div>
              </div>
              {p.closed ? (
                <span className="shrink-0 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">Closed</span>
              ) : p.id === recommended && tab === "shelter" ? (
                <span className="shrink-0 rounded bg-safe/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-safe">Best route</span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="font-semibold tabular">{km(p.t.roadKm)}</span>
              <span className="flex items-center gap-1 text-mute">
                <Car size={12} /> {p.t.driveMin} min
              </span>
              <span className="flex items-center gap-1 text-mute">
                <Footprints size={12} /> {p.t.walkMin} min
              </span>
            </div>
            {p.closed && <div className="mt-1 text-[11px] text-red-300">Cut off by flood water. Go to the next one.</div>}
            <div className="mt-2 flex gap-1.5">
              {!p.closed && (
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.p[0]},${p.p[1]}`} target="_blank" rel="noreferrer" className="btn btn-ghost !px-2 !py-1 text-[11px]">
                  <Navigation size={12} /> Directions
                </a>
              )}
              {p.phone && (
                <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="btn btn-ghost !px-2 !py-1 text-[11px]">
                  <PhoneCall size={12} /> {p.phone}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-dim">Travel times are flood-day estimates. Demo locations are approximate.</p>
    </div>
  );
}

const CH_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = { sms: MessageSquareText, voice: PhoneCall, push: Smartphone };

export function MessageLog({ messages, myPhone }: { messages: MeResponse["messages"]; myPhone: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? messages : messages.slice(0, 6);
  return (
    <div className="panel p-5">
      <PanelHead icon={<MessageSquareText size={13} />} title="Message log" sub="Push, SMS and voice messages from StormShield (simulated delivery)" />
      {messages.length === 0 ? (
        <Empty>Nothing sent yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {shown.map((m) => {
            const Icon = CH_ICON[m.channel] ?? MessageSquareText;
            const outgoing = m.to_phone !== myPhone;
            return (
              <li key={m.id} className="flex gap-2.5 text-sm">
                <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${m.channel === "voice" ? "bg-danger/15 text-danger" : m.channel === "sms" ? "bg-brand/15 text-brand" : "bg-white/5 text-mute"}`}>
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-dim">
                    <span className="font-semibold uppercase">{m.channel === "voice" ? "Voice call" : m.channel}</span>
                    {outgoing ? ` → ${m.to_name}` : " → you"} · {timeAgo(m.created_at)}
                  </div>
                  <div className="break-words text-[13px] text-fg/85">{m.body}</div>
                  {m.channel === "sms" && <div className="mt-0.5 break-words text-[10.5px] text-dim">{SMS_FOOTER}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {messages.length > 6 && (
        <button className="mt-3 text-xs font-semibold text-brand hover:underline" onClick={() => setAll((a) => !a)}>
          {all ? "Show less" : `Show all ${messages.length}`}
        </button>
      )}
    </div>
  );
}

export function ReportHazard({ fallback, onDone }: { fallback: LatLng; onDone: () => void }) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setMsg(null);
    let p = fallback;
    try {
      const g = await getPosition(4000);
      p = [g.lat, g.lng];
    } catch {
      /* use selected place */
    }
    try {
      const r = await api<{ zone: string | null }>("/api/reports", { body: { kind, note, lat: p[0], lng: p[1] } });
      setMsg(`Thanks! Your report is on the map${r.zone ? ` and raises the risk score for ${r.zone}` : ""}.`);
      setKind(null);
      setNote("");
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel p-5">
      <PanelHead icon={<Megaphone size={13} />} title="Report what you see" sub="Community reports feed the risk engine" />
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(REPORT_KINDS) as ReportKind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${kind === k ? "border-watch bg-watch/15 text-watch" : "border-line2 text-fg/80 hover:border-dim"}`}>
            {REPORT_KINDS[k]}
          </button>
        ))}
      </div>
      {kind && (
        <div className="rise mt-3 flex gap-2">
          <input className="input text-sm" placeholder="Where exactly? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
          <button className="btn btn-primary shrink-0" onClick={send} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      )}
      {msg && <div className="mt-2 text-xs text-fg/85">{msg}</div>}
    </div>
  );
}

export function levelBadge(level: keyof typeof LEVEL_META) {
  return LEVEL_META[level];
}
