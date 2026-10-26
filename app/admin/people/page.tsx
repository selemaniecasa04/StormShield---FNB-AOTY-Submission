"use client";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import AdminShell from "@/components/admin/Shell";
import PersonDrawer from "@/components/admin/PersonDrawer";
import { LevelPill } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { CHECK_META, type CheckStatus, type Level } from "@/lib/risk";
import { timeAgo } from "@/lib/format";

interface Person {
  id: number; name: string; phone: string; zone: string | null; level: Level | null; vulnerable: string[]; medical: boolean; language: string; insured: boolean;
  status: string | null; statusAt: string | null; call: { status: string; attempts: number } | null; openTicket: string | null;
}

const FILTERS = [
  ["all", "Everyone"],
  ["risk", "In high-risk areas"],
  ["silent", "No response"],
  ["unreached", "Unreached by phone"],
  ["vulnerable", "Vulnerable"],
  ["help", "Open help request"],
] as const;

export default function PeoplePage() {
  const { data, refresh } = usePoll<{ people: Person[] }>("/api/admin/people", 10000);
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number][0]>("all");
  const [open, setOpen] = useState<number | null>(null);
  const rows = useMemo(() => {
    const hot = (p: Person) => p.level === "red" || p.level === "orange";
    return (data?.people ?? [])
      .filter((p) => !q || `${p.name} ${p.phone} ${p.zone}`.toLowerCase().includes(q.toLowerCase()))
      .filter((p) =>
        f === "all" ? true : f === "risk" ? hot(p) : f === "silent" ? hot(p) && !p.status : f === "unreached" ? p.call?.status === "unreached" : f === "vulnerable" ? p.vulnerable.length > 0 : !!p.openTicket,
      )
      .sort((a, b) => (b.level === "red" ? 2 : b.level === "orange" ? 1 : 0) - (a.level === "red" ? 2 : a.level === "orange" ? 1 : 0));
  }, [data, q, f]);

  return (
    <AdminShell title="People" sub="Registered residents. Open anyone to call them, send help or message them.">
      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input w-64 !pl-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or area" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setF(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${f === k ? "border-brand bg-brand/15" : "border-line2 text-mute"}`}>{l}</button>
          ))}
        </div>
        <span className="ml-auto text-sm text-mute">{rows.length} people</span>
      </div>
      <div className="panel overflow-hidden">
        {!data ? (
          <div className="p-5"><Loader2 className="animate-spin text-mute" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-panel2 text-left text-[11px] uppercase tracking-wider text-dim">
                <tr>{["Name", "Area", "Status", "Phone outreach", "Help", "Needs", "Language"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-white/[.03]" onClick={() => setOpen(p.id)}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-dim">{p.phone}</div>
                    </td>
                    <td className="px-3 py-2">{p.level ? <LevelPill level={p.level}>{p.zone}</LevelPill> : <span className="text-mute">{p.zone ?? "—"}</span>}</td>
                    <td className="px-3 py-2 text-xs">
                      {p.status ? <span style={{ color: CHECK_META[p.status as CheckStatus]?.color }}>{CHECK_META[p.status as CheckStatus]?.label}</span> : <span className="text-watch">No response</span>}
                      {p.statusAt && <div className="text-dim">{timeAgo(p.statusAt)}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.call ? (
                        <span className={p.call.status === "unreached" ? "font-semibold text-warn" : p.call.status === "reached" ? "text-safe" : "text-violet"}>
                          {p.call.status} · {p.call.attempts} call{p.call.attempts === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-dim">Not called</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{p.openTicket ? <span className="font-semibold text-red-300">{p.openTicket}</span> : <span className="text-dim">—</span>}</td>
                    <td className="px-3 py-2 text-xs">
                      {p.vulnerable.map((v) => <span key={v} className="mr-1 rounded-full bg-violet/15 px-1.5 py-0.5 text-[10px] text-violet">{v}</span>)}
                      {p.medical && <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] text-red-300">medical</span>}
                      {p.insured && <span className="ml-1 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand">insured</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-mute">{p.language}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <PersonDrawer userId={open} onClose={() => setOpen(null)} onChange={refresh} />
    </AdminShell>
  );
}
