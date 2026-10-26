"use client";
import { useMemo, useState } from "react";
import { Check, Download, Loader2, MapPin, X } from "lucide-react";
import AdminShell from "@/components/admin/Shell";
import { StormMap, DEFAULT_LAYERS } from "@/components/map";
import { PanelHead } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/client";
import { PRIORITY_COLOR } from "@/lib/risk";
import { clock, timeAgo } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { StatusResponse } from "@/lib/types";

interface Incident {
  id: string; kind: "report" | "ticket"; rawId: number; type: string; source: string; reporter: string; phone: string | null; zone: string | null;
  lat: number; lng: number; note: string | null; status: string; priority: string; createdAt: string; unit: string | null;
}
interface Data { incidents: Incident[]; audit: { actor: string; action: string; detail: string; created_at: string }[] }

const HOURS = [1, 3, 6, 24, 0];

export default function ReportsPage() {
  const { data, refresh } = usePoll<Data>("/api/admin/reports", 8000);
  const st = usePoll<StatusResponse>("/api/status", 30000);
  const [kind, setKind] = useState<"all" | "report" | "ticket">("all");
  const [source, setSource] = useState("all");
  const [zone, setZone] = useState("all");
  const [hours, setHours] = useState(0);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<{ p: LatLng; zoom?: number; key?: number } | null>(null);

  const rows = useMemo(() => {
    const now = Date.now();
    return (data?.incidents ?? []).filter(
      (r) =>
        (kind === "all" || r.kind === kind) &&
        (source === "all" || r.source === source) &&
        (zone === "all" || r.zone === zone) &&
        (!hours || now - new Date(r.createdAt).getTime() < hours * 3_600_000) &&
        (!q || `${r.id} ${r.type} ${r.reporter} ${r.note ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    );
  }, [data, kind, source, zone, hours, q]);
  const sources = useMemo(() => [...new Set((data?.incidents ?? []).map((r) => r.source))], [data]);
  const zones = useMemo(() => [...new Set((data?.incidents ?? []).map((r) => r.zone).filter(Boolean))] as string[], [data]);
  const byZone = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => (m[r.zone ?? "Unknown"] = (m[r.zone ?? "Unknown"] ?? 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const mark = async (id: number, status: string) => {
    await api("/api/admin/reports", { method: "PATCH", body: { reportId: id, status } });
    refresh();
  };

  return (
    <AdminShell
      title="Reports"
      sub="Every incident, where it came from and where it is"
      actions={
        <a href="/api/admin/reports?format=csv" className="btn btn-ghost">
          <Download size={16} /> Export CSV
        </a>
      }
    >
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="text-xs text-mute">
          Search
          <input className="input mt-1 w-56 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, reference, details" />
        </label>
        <label className="text-xs text-mute">
          Category
          <select className="input mt-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">All</option>
            <option value="ticket">Help requests</option>
            <option value="report">Community reports</option>
          </select>
        </label>
        <label className="text-xs text-mute">
          Source
          <select className="input mt-1 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">All sources</option>
            {sources.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-mute">
          Area
          <select className="input mt-1 text-sm" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="all">All areas</option>
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
        </label>
        <div className="text-xs text-mute">
          Time
          <div className="mt-1 flex gap-1 rounded-lg bg-black/30 p-1">
            {HOURS.map((h) => (
              <button key={h} onClick={() => setHours(h)} className={`rounded-md px-2 py-1 text-xs font-semibold ${hours === h ? "bg-white/10 text-fg" : ""}`}>{h ? `${h} h` : "All"}</button>
            ))}
          </div>
        </div>
        <div className="ml-auto text-sm text-mute">{rows.length} shown</div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 [&>*]:min-w-0">
        <div className="panel overflow-hidden xl:col-span-8">
          {!data ? (
            <div className="p-5"><Loader2 className="animate-spin text-mute" /></div>
          ) : (
            <div className="max-h-[640px] overflow-auto thin-scroll">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="sticky top-0 bg-panel2 text-left text-[11px] uppercase tracking-wider text-dim">
                  <tr>
                    {["Ref", "Type", "Source", "Reported by", "Where", "Status", "Time", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top hover:bg-white/[.02]">
                      <td className="px-3 py-2 font-mono text-xs">
                        <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: PRIORITY_COLOR[r.priority] }} />{r.id}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.type}</div>
                        {r.note && <div className="max-w-[260px] truncate text-xs text-mute" title={r.note}>{r.note}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-mute">{r.source}</td>
                      <td className="px-3 py-2 text-xs">{r.reporter}<div className="text-dim">{r.phone}</div></td>
                      <td className="px-3 py-2 text-xs">
                        <button className="flex items-center gap-1 text-left hover:text-brand" onClick={() => setFocus({ p: [r.lat, r.lng], zoom: 15, key: Date.now() })}>
                          <MapPin size={12} /> {r.zone ?? "—"}
                        </button>
                        <a className="font-mono text-[10px] text-dim hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}>{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</a>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={r.status === "dismissed" ? "text-dim line-through" : r.status === "verified" ? "text-safe" : ""}>{r.status}</span>
                        {r.unit && <div className="text-dim">{r.unit}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-mute">{clock(r.createdAt)}<div className="text-dim">{timeAgo(r.createdAt)}</div></td>
                      <td className="px-3 py-2">
                        {r.kind === "report" && r.status === "new" && (
                          <div className="flex gap-1">
                            <button className="rounded-md border border-safe/40 p-1 text-safe hover:bg-safe/10" title="Verify" aria-label="Verify report" onClick={() => mark(r.rawId, "verified")}><Check size={13} /></button>
                            <button className="rounded-md border border-line2 p-1 text-mute hover:bg-white/5" title="Dismiss (stops counting towards risk)" aria-label="Dismiss report" onClick={() => mark(r.rawId, "dismissed")}><X size={13} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="space-y-4 xl:col-span-4">
          <div className="relative h-[340px] overflow-hidden rounded-2xl border border-line">
            <StormMap
              snap={st.data?.snap ?? null}
              layers={{ ...DEFAULT_LAYERS, labels: false, flood: true, evac: false, shelter: false, hospital: false, gauges: false, storm: false, reports: true }}
              reports={rows.filter((r) => r.kind === "report").map((r) => ({ id: r.rawId, kind: "flooded_road", note: `${r.type}: ${r.note ?? ""}`, lat: r.lat, lng: r.lng, zone_id: null, created_at: r.createdAt }))}
              tickets={rows.filter((r) => r.kind === "ticket").map((r) => ({ id: r.rawId, p: [r.lat, r.lng], ref: r.id, label: r.type, status: r.status === "Resolved" ? "resolved" : "open", name: r.reporter }))}
              focus={focus}
            />
          </div>
          <div className="panel p-5">
            <PanelHead title="By area" />
            <ul className="space-y-1.5">
              {byZone.map(([z, n]) => (
                <li key={z} className="flex items-center gap-2 text-sm">
                  <span className="w-40 truncate">{z}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-brand" style={{ width: `${(n / Math.max(1, byZone[0]?.[1] ?? 1)) * 100}%` }} /></div>
                  <span className="w-6 text-right font-mono text-xs">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <PanelHead title="Staff action log" sub="Who did what (audit trail)" />
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-sm thin-scroll">
          {(data?.audit ?? []).map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-12 shrink-0 font-mono text-xs text-dim">{clock(a.created_at)}</span>
              <span className="w-36 shrink-0 truncate font-medium">{a.actor}</span>
              <span className="text-fg/85">{a.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </AdminShell>
  );
}
