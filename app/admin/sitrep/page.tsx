"use client";
import { useMemo } from "react";
import { Loader2, Printer } from "lucide-react";
import AdminShell from "@/components/admin/Shell";
import { usePoll } from "@/hooks/usePoll";
import { useSession } from "@/hooks/useSession";
import { closuresAt } from "@/components/map/model";
import { LEVEL_META, TICKET_TYPES, type Level, type TicketType } from "@/lib/risk";
import { clock, drillClock, inHours } from "@/lib/format";
import type { Snapshot, ZoneState } from "@/lib/engine";
import type { EventInfo, StatusResponse } from "@/lib/types";
import type { UnitRow } from "@/lib/dispatch";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Overview {
  event: EventInfo;
  snap: Snapshot;
  kpi: any;
  tickets: { id: number; ref: string; type: string; status: string; team: string | null; priority: string; zoneName: string | null }[];
  units: UnitRow[];
  outreach: { stats: { total: number; reached: number; unreached: number; ringing: number; queued: number; safe: number; preparing: number; help: number } };
  zones: (ZoneState & { residents: number; safe: number; help: number; pending: number; vulnerable: number; affected: number })[];
  shelters: { id: string; name: string; capacity: number; open: boolean; demand: number }[];
}

export default function Sitrep() {
  const { data } = usePoll<Overview>("/api/admin/overview", 30000);
  const st = usePoll<StatusResponse>("/api/status", 30000);
  const { user } = useSession();
  const closed = useMemo(() => (data ? closuresAt(data.snap, 0).filter((c) => c.closed) : []), [data]);
  const zones = useMemo(() => (data ? [...data.zones].sort((a, b) => b.score - a.score) : []), [data]);

  return (
    <AdminShell
      title="Situation report"
      sub="One-page summary for the municipality and partners. Print or save as PDF."
      actions={
        <button className="btn btn-primary print:hidden" onClick={() => window.print()}>
          <Printer size={16} /> Print / save PDF
        </button>
      }
    >
      {!data ? (
        <Loader2 className="animate-spin text-mute" />
      ) : (
        <article className="panel space-y-6 p-6 print:border-0 print:p-0">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <div className="label">StormShield situation report</div>
              <h2 className="mt-1 text-2xl font-semibold">{data.event.title}</h2>
              <div className="text-sm text-mute">
                {data.event.mode === "drill" ? `DRILL (simulated) · ${drillClock(data.event.hour)}` : "Live monitoring"} · issued {new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}
                {user ? ` · prepared by ${user.firstName} ${user.surname}` : ""}
              </div>
            </div>
            <div className="rounded-xl px-4 py-2 text-center" style={{ background: LEVEL_META[data.snap.city.level].soft, color: LEVEL_META[data.snap.city.level].text }}>
              <div className="text-[10px] font-bold uppercase tracking-wider">City level</div>
              <div className="text-lg font-bold">{LEVEL_META[data.snap.city.level].label}</div>
            </div>
          </header>

          <section>
            <h3 className="label mb-2">Summary</h3>
            <p className="text-sm leading-relaxed">
              {data.snap.city.counts.red} area(s) at extreme risk and {data.snap.city.counts.orange} at high risk. About {data.kpi.affected.toLocaleString("en-ZA")} people are estimated to live in affected parts of these areas.
              {" "}{data.kpi.residents} residents are registered on StormShield; {data.kpi.inRed} are in extreme-risk areas. Automated calls have reached {data.outreach.stats.reached} of {data.outreach.stats.total} people called; {data.outreach.stats.unreached} could not be reached after 3 calls and their families were notified.
              {" "}{data.kpi.openTickets} help requests are open and {data.units.filter((u) => u.status !== "available").length} of {data.units.length} units are deployed. {closed.length} roads are closed.
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Safe / evacuating", `${data.kpi.safe} / ${data.kpi.evacuating}`],
              ["No response (at risk)", data.kpi.noResponse],
              ["Open help requests", data.kpi.openTickets],
              ["Vulnerable at risk", data.kpi.vulnerableInDanger],
              ["Called / reached", `${data.outreach.stats.total} / ${data.outreach.stats.reached}`],
              ["Unreached (3 calls)", data.outreach.stats.unreached],
              ["Units deployed", `${data.units.filter((u) => u.status !== "available").length} / ${data.units.length}`],
              ["Alerts issued", data.kpi.alerts],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-line p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-dim">{k}</div>
                <div className="text-xl font-bold tabular">{v}</div>
              </div>
            ))}
          </section>

          <section>
            <h3 className="label mb-2">Areas</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-dim">
                  <tr>{["Area", "Level", "Score", "Outlook", "Depth", "Registered", "Safe", "Help", "Silent", "Est. affected"].map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {zones.map((z) => (
                    <tr key={z.id}>
                      <td className="py-1.5 pr-3 font-medium">{z.name}</td>
                      <td className="py-1.5 pr-3"><span className="font-semibold" style={{ color: LEVEL_META[z.level as Level].color }}>{z.category}</span></td>
                      <td className="py-1.5 pr-3 font-mono">{z.score}</td>
                      <td className="py-1.5 pr-3 text-xs">{z.level === "red" ? `peak ${inHours(z.peakIn)}` : z.redIn !== null ? `extreme ${inHours(z.redIn)}` : z.trend}</td>
                      <td className="py-1.5 pr-3">{z.depthM ? `${z.depthM} m` : "—"}</td>
                      <td className="py-1.5 pr-3">{z.residents}</td>
                      <td className="py-1.5 pr-3">{z.safe}</td>
                      <td className="py-1.5 pr-3">{z.help}</td>
                      <td className="py-1.5 pr-3">{z.pending}</td>
                      <td className="py-1.5 pr-3">{z.affected.toLocaleString("en-ZA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section>
              <h3 className="label mb-2">Open help requests</h3>
              <ul className="space-y-1 text-sm">
                {data.tickets.filter((t) => t.status !== "resolved").map((t) => (
                  <li key={t.id} className="flex justify-between gap-3">
                    <span>{t.ref} · {TICKET_TYPES[t.type as TicketType] ?? t.type} · {t.zoneName}</span>
                    <span className="text-mute">{t.team ?? "awaiting unit"}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="label mb-2">Road closures</h3>
              <ul className="space-y-1 text-sm">{closed.length ? closed.map((c) => <li key={c.id}>{c.name}</li>) : <li className="text-mute">None</li>}</ul>
              <h3 className="label mb-2 mt-4">Shelters</h3>
              <ul className="space-y-1 text-sm">
                {data.shelters.filter((s) => s.capacity).map((s) => (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span>{s.name}</span>
                    <span className={!s.open ? "text-danger" : s.demand > s.capacity ? "text-warn" : "text-mute"}>{s.open ? `${s.demand}/${s.capacity} expected` : "cut off"}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section>
            <h3 className="label mb-2">Latest alerts</h3>
            <ul className="space-y-1 text-sm">
              {(st.data?.alerts ?? []).slice(0, 10).map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="w-12 shrink-0 font-mono text-xs text-dim">{clock(a.createdAt)}</span>
                  <span className="font-medium" style={{ color: LEVEL_META[a.level].color }}>{a.title}</span>
                  <span className="text-mute">{a.body}</span>
                </li>
              ))}
            </ul>
          </section>
          <footer className="border-t border-line pt-3 text-[11px] text-dim">
            Generated by StormShield. Flood model, population estimates and facility locations are indicative and should be confirmed with field reports and SAWS warnings.
          </footer>
        </article>
      )}
    </AdminShell>
  );
}
