"use client";
import { useMemo, useState } from "react";
import { Loader2, PhoneCall, Truck } from "lucide-react";
import AdminShell from "@/components/admin/Shell";
import DispatchModal, { type DispatchTarget } from "@/components/admin/DispatchModal";
import { StormMap, DEFAULT_LAYERS } from "@/components/map";
import { PanelHead } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/client";
import { UNIT_TYPES, etaMinutes, recommendType, type UnitRow, type UnitType } from "@/lib/dispatch";
import { PRIORITY_COLOR, TICKET_STATUS_LABEL, TICKET_TYPES, type TicketStatus, type TicketType } from "@/lib/risk";
import { timeAgo } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { Snapshot } from "@/lib/engine";

interface Ticket { id: number; ref: string; type: string; p: LatLng; status: string; team: string | null; name: string; phone: string; priority: string; etaAt: string | null; createdAt: string; zoneName: string | null; unitId: string | null }
interface Data { snap: Snapshot; tickets: Ticket[]; units: UnitRow[] }

export default function DispatchPage() {
  const { data, refresh } = usePoll<Data>("/api/admin/overview", 4000);
  const [dispatch, setDispatch] = useState<DispatchTarget | null>(null);
  const [focus, setFocus] = useState<{ p: LatLng; zoom?: number; key?: number } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const waiting = useMemo(() => (data?.tickets ?? []).filter((t) => t.status === "received"), [data]);
  const active = useMemo(() => (data?.tickets ?? []).filter((t) => t.status === "en_route" || t.status === "on_scene"), [data]);
  const byType = useMemo(() => {
    const g: Partial<Record<UnitType, UnitRow[]>> = {};
    for (const u of data?.units ?? []) (g[u.type] ??= []).push(u);
    return g;
  }, [data]);
  const act = async (id: number, action: "arrive" | "resolve") => {
    setBusy(id);
    try {
      await api("/api/admin/dispatch", { body: { action, ticketId: id } });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title="Dispatch" sub="Send the nearest suitable unit; residents see the unit and ETA on their phone">
      {!data ? (
        <Loader2 className="animate-spin text-mute" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 [&>*]:min-w-0">
            <section className="relative h-[60dvh] min-h-[420px] overflow-hidden rounded-2xl border border-line xl:col-span-8 xl:h-[640px]">
              <StormMap
                snap={data.snap}
                layers={{ ...DEFAULT_LAYERS, labels: true, gauges: false, storm: false, reports: false, police: true, fire: true }}
                tickets={[...waiting, ...active].map((t) => ({ id: t.id, p: t.p, ref: t.ref, label: TICKET_TYPES[t.type as TicketType] ?? t.type, status: t.status, name: t.name }))}
                units={data.units}
                focus={focus}
              />
            </section>
            <section className="panel flex min-h-[420px] flex-col overflow-hidden xl:col-span-4 xl:h-[640px]">
              <div className="border-b border-line p-4">
                <div className="label">Waiting for a unit ({waiting.length})</div>
              </div>
              <ul className="flex-1 space-y-2 overflow-y-auto p-4 thin-scroll">
                {waiting.length === 0 && <li className="text-sm text-mute">Every request has a unit.</li>}
                {waiting.map((t) => {
                  const rt = recommendType(t.type);
                  const best = data.units.filter((u) => u.type === rt && u.status === "available").map((u) => ({ u, eta: etaMinutes(u.base, t.p, u.type) })).sort((a, b) => a.eta - b.eta)[0];
                  return (
                    <li key={t.id} className="rounded-xl border border-danger/40 bg-danger/[.05] p-3">
                      <button className="w-full text-left" onClick={() => setFocus({ p: t.p, zoom: 14, key: Date.now() })}>
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                          {t.ref} · {TICKET_TYPES[t.type as TicketType] ?? t.type}
                        </div>
                        <div className="text-xs text-mute">{t.name} · {t.zoneName} · {timeAgo(t.createdAt)}</div>
                      </button>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="flex-1 text-[11px] text-dim">
                          Suggested: {best ? `${best.u.name} (${best.eta} min)` : `no ${UNIT_TYPES[rt].short} free`}
                        </span>
                        {best && (
                          <button className="btn btn-danger !px-2 !py-1 text-[11px]" onClick={() => api("/api/admin/dispatch", { body: { action: "dispatch", ticketId: t.id, unitId: best.u.id } }).then(refresh)}>
                            Send
                          </button>
                        )}
                        <button className="btn btn-ghost !px-2 !py-1 text-[11px]" onClick={() => setDispatch({ ticketId: t.id, ref: t.ref, type: t.type, p: t.p, name: t.name })}>
                          Choose…
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <div className="panel p-5">
              <PanelHead title={`Active responses (${active.length})`} />
              <ul className="space-y-2">
                {active.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-black/20 p-3 text-sm">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setFocus({ p: t.p, zoom: 14, key: Date.now() })}>
                      <div className="font-semibold">{t.ref} · {t.team}</div>
                      <div className="text-xs text-mute">
                        {t.name} · {TICKET_STATUS_LABEL[t.status as TicketStatus]}
                        {t.status === "en_route" && t.etaAt ? ` · ETA ${Math.max(0, Math.ceil((new Date(t.etaAt).getTime() - Date.now()) / 60000))} min` : ""}
                      </div>
                    </button>
                    <a href={`tel:${t.phone}`} className="btn btn-ghost !px-2 !py-1 text-[11px]"><PhoneCall size={12} /> Resident</a>
                    {t.status === "en_route" && <button className="btn btn-ghost !px-2 !py-1 text-[11px]" disabled={busy === t.id} onClick={() => act(t.id, "arrive")}>On scene</button>}
                    <button className="btn btn-primary !px-2 !py-1 text-[11px]" disabled={busy === t.id} onClick={() => act(t.id, "resolve")}>Resolve</button>
                  </li>
                ))}
                {!active.length && <li className="text-sm text-mute">No units deployed.</li>}
              </ul>
            </div>
            <div className="panel p-5">
              <PanelHead title="Fleet" sub={`${data.units.filter((u) => u.status === "available").length} of ${data.units.length} available`} />
              <div className="space-y-3">
                {(Object.keys(byType) as UnitType[]).map((t) => (
                  <div key={t}>
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: UNIT_TYPES[t].color }}>{UNIT_TYPES[t].label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {byType[t]!.map((u) => (
                        <button key={u.id} onClick={() => setFocus({ p: u.p, zoom: 14, key: Date.now() })} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${u.status === "available" ? "border-line2" : "border-transparent"}`} style={u.status !== "available" ? { background: `${UNIT_TYPES[t].color}22` } : undefined}>
                          <Truck size={12} style={{ color: UNIT_TYPES[t].color }} /> {u.name}
                          <span className="text-dim">{u.status === "available" ? "free" : u.status === "on_scene" ? `on scene ${u.ticketRef}` : `→ ${u.ticketRef}`}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      <DispatchModal target={dispatch} onClose={() => setDispatch(null)} onDone={refresh} />
    </AdminShell>
  );
}
