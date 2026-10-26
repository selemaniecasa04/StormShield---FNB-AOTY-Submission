"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BadgeCheck, Car, CheckCircle2, FileText, Loader2, PhoneCall, Rocket, Search, ShieldCheck, TrendingDown, Umbrella, Users, Wallet,
} from "lucide-react";
import { StormMap, DEFAULT_LAYERS } from "@/components/map";
import { EventBanner } from "@/components/panels";
import { LevelPill, Modal, PanelHead } from "@/components/ui";
import { StaffPulse } from "@/components/Toasts";
import OutreachFlow from "@/components/OutreachFlow";
import ProgressBar, { type OutreachStats } from "@/components/admin/ProgressBar";
import { usePoll } from "@/hooks/usePoll";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/client";
import { AVG_VEHICLE_FLOOD_CLAIM, CLAIM_STATUS_LABEL, COVER, rand, randShort, type Cover } from "@/lib/insurance";
import { CHECK_META, LEVEL_META, type CheckStatus, type Level } from "@/lib/risk";
import { RESULT_LABEL } from "@/lib/outreach-text";
import { inHours, timeAgo } from "@/lib/format";
import type { Snapshot } from "@/lib/engine";
import type { EventInfo } from "@/lib/types";
import type { LatLng } from "@/lib/geo";

interface Holder {
  id: number; name: string; phone: string; address: string; p: LatLng; zone: string | null; level: Level | null; score: number; depthM: number; peakIn: number | null;
  policyNo: string; cover: string[]; sumInsured: number; vehicle: string | null; mitigatedAt: string | null; vulnerable: boolean; status: string | null;
  call: { status: string; result: string | null; attempts: number } | null; alerts: number;
}
interface Claim {
  id: number; ref: string; kind: string; description: string; depthCm: number | null; p: LatLng; photos: string[]; status: string; validation: string; validationNote: string;
  modelDepth: number | null; alertedBefore: boolean; mitigated: boolean; assessor: string | null; amount: number | null; createdAt: string; updatedAt: string;
  name: string; phone: string; policyNo: string; address: string; zone: string | null; sumInsured: number | null;
}
interface Data {
  insurer: { id: string; name: string; staff: string };
  event: { title: string; mode: string };
  snap: Snapshot;
  kpi: { policyholders: number; atRisk: number; inRed: number; sumAtRisk: number; vehiclesAtRisk: number; reached: number; mitigated: number; avoided: number; claimsOpen: number; claimsReview: number };
  holders: Holder[];
  byZone: { zone: string; level: Level | null; count: number; sum: number; mitigated: number }[];
  claims: Claim[];
  outreach: { stats: OutreachStats; campaigns: { id: number; title: string; created_at: string; stats: OutreachStats }[]; targets: { id: number; userId: number; status: string; result: string | null; attempts: number; name: string; updatedAt: string }[] };
}
type Tab = "holders" | "claims" | "outreach";

export default function InsurerPortal() {
  const router = useRouter();
  const { user, loading } = useSession();
  const { data, refresh } = usePoll<Data>("/api/insurer", 5000);
  const st = usePoll<{ event: EventInfo; snap: Snapshot }>("/api/status", 15000);
  const [tab, setTab] = useState<Tab>("holders");
  const [focus, setFocus] = useState<{ p: LatLng; zoom?: number; key?: number } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== "insurer") router.replace(user.role === "admin" ? "/admin" : "/dashboard");
  }, [user, loading, router]);

  if (!data) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-mute">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  const k = data.kpi;
  const fly = (p: LatLng) => setFocus({ p, zoom: 15, key: Date.now() });

  return (
    <div>
      <EventBanner event={st.data?.event} snap={st.data?.snap} />
      <StaffPulse />
      <main className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Umbrella size={22} className="text-brand" /> {data.insurer.name} <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mute">Demo insurer</span>
            </h1>
            <p className="text-sm text-mute">Insurer portal · {data.insurer.staff} · policyholders who agreed to share StormShield data</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          <Kpi icon={Users} label="Policyholders" value={k.policyholders} />
          <Kpi icon={AlertTriangle} label="At high / extreme risk" value={k.atRisk} color={LEVEL_META.orange.color} sub={`${k.inRed} extreme`} />
          <Kpi icon={Wallet} label="Sum insured at risk" value={randShort(k.sumAtRisk)} color="#fca5a5" />
          <Kpi icon={Car} label="Insured vehicles at risk" value={k.vehiclesAtRisk} />
          <Kpi icon={PhoneCall} label="Warned & responded" value={`${k.reached}/${k.atRisk}`} color="#3cc7f5" />
          <Kpi icon={ShieldCheck} label="Moved car / valuables" value={k.mitigated} color="#22c55e" sub="confirmed before loss" />
          <Kpi icon={TrendingDown} label="Est. losses avoided" value={randShort(k.avoided)} color="#22c55e" sub={`at ${randShort(AVG_VEHICLE_FLOOD_CLAIM)} per vehicle`} />
          <Kpi icon={FileText} label="Open claims" value={k.claimsOpen} sub={`${k.claimsReview} need review`} color={k.claimsReview ? "#fbbf24" : undefined} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 [&>*]:min-w-0">
          <section className="relative h-[56dvh] min-h-[420px] overflow-hidden rounded-2xl border border-line xl:col-span-8 xl:h-[600px]">
            <StormMap
              snap={data.snap}
              layers={{ ...DEFAULT_LAYERS, labels: true, gauges: false, hospital: false, evac: false, storm: false }}
              people={data.holders.map((h) => ({ id: h.id, p: h.p, name: `${h.name} · ${h.policyNo}`, status: h.status, vulnerable: h.vulnerable ? ["vulnerable"] : [], sub: `${h.zone ?? ""} · ${rand(h.sumInsured)}${h.mitigatedAt ? " · protected" : ""}` }))}
              focus={focus}
            />
            <div className="absolute bottom-3 left-3 z-[1000] rounded-xl border border-line2 bg-bg/90 p-2.5 text-[11px] shadow-xl backdrop-blur">
              <div className="mb-1 font-semibold text-mute">Policyholders</div>
              {(Object.keys(CHECK_META) as CheckStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHECK_META[s].color }} />{CHECK_META[s].label}</div>
              ))}
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#8b9db0]" /> No response</div>
            </div>
          </section>
          <div className="space-y-4 xl:col-span-4">
            <Campaign stats={data.outreach.stats} atRisk={k.atRisk} insurer={data.insurer.name} onDone={refresh} />
            <div className="panel p-5">
              <PanelHead title="Exposure by area" sub="Total sum insured of policyholders living there" />
              <ul className="space-y-2">
                {data.byZone.slice(0, 8).map((z) => (
                  <li key={z.zone} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate">
                        {z.level && <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_META[z.level].color }} />} {z.zone}
                      </span>
                      <span className="font-mono text-xs">{randShort(z.sum)} · {z.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[.06]">
                      <div className="h-full rounded-full" style={{ width: `${(z.sum / Math.max(1, data.byZone[0]?.sum ?? 1)) * 100}%`, background: z.level ? LEVEL_META[z.level].color : "#475569" }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="border-b border-line">
          <div className="flex gap-1 overflow-x-auto thin-scroll">
            {(
              [
                ["holders", `Policyholders (${data.holders.length})`],
                ["claims", `Claims (${data.claims.length})`],
                ["outreach", "Outreach"],
              ] as const
            ).map(([id, l]) => (
              <button key={id} onClick={() => setTab(id)} className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === id ? "border-brand text-fg" : "border-transparent text-mute hover:text-fg"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {tab === "holders" && <Holders holders={data.holders} onFocus={fly} onChange={refresh} />}
        {tab === "claims" && <Claims claims={data.claims} onFocus={fly} onChange={refresh} />}
        {tab === "outreach" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <div className="panel p-5">
              <PanelHead title="How calls work" />
              <OutreachFlow compact />
            </div>
            <div className="panel p-5">
              <PanelHead title="Your campaigns" />
              {data.outreach.campaigns.length === 0 ? (
                <div className="text-sm text-mute">No campaigns yet. Launch pre-loss calls from the panel above.</div>
              ) : (
                <ul className="space-y-3">
                  {data.outreach.campaigns.map((c) => (
                    <li key={c.id} className="rounded-xl border border-line bg-black/20 p-3">
                      <div className="flex justify-between gap-2 text-sm"><span className="font-semibold">{c.title}</span><span className="text-xs text-dim">{timeAgo(c.created_at)}</span></div>
                      <div className="mt-2"><ProgressBar s={c.stats} /></div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 label">Latest responses</div>
              <ul className="mt-2 space-y-1 text-xs">
                {data.outreach.targets.slice(0, 15).map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span>{t.name}</span>
                    <span className="text-mute">{t.status === "reached" ? RESULT_LABEL[t.result ?? ""] ?? t.result : `${t.status} · ${t.attempts} call(s)`}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color, sub }: { icon: React.ComponentType<{ size?: number }>; label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim"><Icon size={12} /> <span className="truncate">{label}</span></div>
      <div className="mt-1 text-2xl font-bold tabular" style={{ color }}>{value}</div>
      {sub && <div className="truncate text-[10px] text-dim">{sub}</div>}
    </div>
  );
}

function Campaign({ stats, atRisk, insurer, onDone }: { stats: OutreachStats; atRisk: number; insurer: string; onDone: () => void }) {
  const [scope, setScope] = useState<"orange+" | "red">("orange+");
  const [message, setMessage] = useState(`${insurer}: flooding is expected near your insured property. Move vehicles and valuables to higher ground now and keep your policy number with you.`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ count: number }>("/api/insurer", { body: { action: "campaign", scope, message } });
      setMsg(r.count ? `${r.count} policyholders are being called and sent an SMS now.` : "Everyone at risk is already being called or has responded.");
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel p-5">
      <PanelHead icon={<Rocket size={13} />} title="Pre-loss outreach" sub={`${atRisk} policyholders are in high or extreme risk areas`} />
      <p className="mb-3 text-xs text-mute">Call and SMS your customers before the water arrives, asking them to move cars and valuables. Key 2 on the call is recorded as &ldquo;protected&rdquo;. No answer means 3 attempts, then their emergency contact is told.</p>
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1 text-xs">
        {([["orange+", "High + extreme"], ["red", "Extreme only"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setScope(k)} className={`rounded-md py-1.5 font-semibold ${scope === k ? "bg-white/10" : "text-mute"}`}>{l}</button>
        ))}
      </div>
      <textarea className="input min-h-[70px] text-sm" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} />
      <button className="btn btn-primary mt-2 w-full" disabled={busy} onClick={go}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <PhoneCall size={15} />} Call policyholders now
      </button>
      {msg && <div className="mt-2 text-xs">{msg}</div>}
      {stats.total > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] text-dim">All calls to your customers this event</div>
          <ProgressBar s={stats} />
        </div>
      )}
    </div>
  );
}

function Holders({ holders, onFocus, onChange }: { holders: Holder[]; onFocus: (p: LatLng) => void; onChange: () => void }) {
  const [q, setQ] = useState("");
  const [onlyRisk, setOnlyRisk] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const rows = useMemo(
    () =>
      holders
        .filter((h) => (!onlyRisk || h.level === "red" || h.level === "orange") && (!q || `${h.name} ${h.policyNo} ${h.zone}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.score - a.score || b.sumInsured - a.sumInsured),
    [holders, q, onlyRisk],
  );
  const call = async (id: number) => {
    setBusy(id);
    try {
      await api("/api/insurer", { body: { action: "call", userId: id } });
      onChange();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input w-64 !pl-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, policy or area" />
        </div>
        <label className="flex items-center gap-2 text-sm text-mute">
          <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} className="accent-[#3cc7f5]" /> At risk only
        </label>
        <span className="ml-auto text-sm text-mute">{rows.length} shown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-panel2 text-left text-[11px] uppercase tracking-wider text-dim">
            <tr>{["Policyholder", "Area risk", "Cover", "Sum insured", "Warned", "Response", "Protected", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((h) => (
              <tr key={h.id} className="align-top hover:bg-white/[.02]">
                <td className="px-3 py-2">
                  <button className="text-left font-medium hover:underline" onClick={() => onFocus(h.p)}>{h.name}</button>
                  <div className="font-mono text-[11px] text-dim">{h.policyNo}</div>
                </td>
                <td className="px-3 py-2">
                  {h.level ? <LevelPill level={h.level}>{h.zone}</LevelPill> : <span className="text-mute">{h.zone ?? "—"}</span>}
                  {h.level && (h.level === "red" || h.level === "orange") && <div className="mt-1 text-[11px] text-dim">{h.depthM ? `up to ${h.depthM} m` : ""}{h.peakIn ? ` · peak ${inHours(h.peakIn)}` : ""}</div>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {h.cover.map((c) => COVER[c as Cover]).join(", ")}
                  {h.vehicle && <div className="text-dim">{h.vehicle}</div>}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{rand(h.sumInsured)}</td>
                <td className="px-3 py-2 text-xs">{h.alerts ? `${h.alerts} alert${h.alerts > 1 ? "s" : ""}` : <span className="text-dim">none</span>}</td>
                <td className="px-3 py-2 text-xs">
                  {h.call ? (
                    <span className={h.call.status === "unreached" ? "text-warn" : h.call.status === "reached" ? "text-safe" : "text-violet"}>
                      {h.call.status === "reached" ? RESULT_LABEL[h.call.result ?? ""] ?? "Reached" : `${h.call.status} · ${h.call.attempts} call(s)`}
                    </span>
                  ) : h.status ? (
                    <span style={{ color: CHECK_META[h.status as CheckStatus]?.color }}>{CHECK_META[h.status as CheckStatus]?.label}</span>
                  ) : (
                    <span className="text-dim">No response</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{h.mitigatedAt ? <span className="flex items-center gap-1 text-safe"><BadgeCheck size={13} /> {timeAgo(h.mitigatedAt)}</span> : <span className="text-dim">—</span>}</td>
                <td className="px-3 py-2 text-right">
                  <button className="btn btn-ghost !px-2 !py-1 text-[11px]" disabled={busy === h.id} onClick={() => call(h.id)}>
                    {busy === h.id ? <Loader2 size={12} className="animate-spin" /> : <PhoneCall size={12} />} Call
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ASSESSORS = ["M. Pillay (field assessor)", "T. Ngcobo (field assessor)", "R. Botha (desk assessor)", "Auto-assess (photos)"];

function Claims({ claims, onFocus, onChange }: { claims: Claim[]; onFocus: (p: LatLng) => void; onChange: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const update = async (c: Claim, body: Record<string, unknown>) => {
    setBusy(c.id);
    try {
      await api(`/api/insurer/claims/${c.id}`, { method: "PATCH", body });
      onChange();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  if (!claims.length) return <div className="panel p-5 text-sm text-mute">No claims yet.</div>;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {claims.map((c) => {
        const ok = c.validation === "consistent";
        const closed = c.status === "settled" || c.status === "rejected";
        return (
          <div key={c.id} className={`panel p-4 ${closed ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{c.ref} · {COVER[c.kind as Cover] ?? c.kind}</div>
                <div className="text-xs text-mute">{c.name} · <span className="font-mono">{c.policyNo}</span> · {c.zone ?? c.address}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold">{CLAIM_STATUS_LABEL[c.status]}</div>
                <div className="text-[11px] text-dim">{timeAgo(c.createdAt)}</div>
              </div>
            </div>
            <p className="mt-2 text-sm text-fg/90">{c.description}</p>
            {c.photos.length > 0 && (
              <div className="mt-2 flex gap-2">
                {c.photos.map((p, i) => (
                  <button key={i} onClick={() => setPhoto(p)} className="h-16 w-16 overflow-hidden rounded-lg border border-line2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={`Claim photo ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div className={`mt-3 rounded-xl border p-3 text-xs ${ok ? "border-safe/40 bg-safe/[.06]" : "border-warn/50 bg-warn/[.07]"}`}>
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                {ok ? <CheckCircle2 size={14} className="text-safe" /> : <AlertTriangle size={14} className="text-warn" />}
                {ok ? "Matches StormShield flood data" : "Needs review: does not match flood data"}
              </div>
              <div className="text-fg/80">{c.validationNote}</div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-mute">
                <span>Reported depth: {c.depthCm != null ? `${(c.depthCm / 100).toFixed(2)} m` : "—"}</span>
                <span>Modelled: {c.modelDepth != null ? `${c.modelDepth.toFixed(1)} m` : "—"}</span>
                <span>Warned before loss: {c.alertedBefore ? "yes" : "no"}</span>
                <span>Protected property: {c.mitigated ? "yes" : "no"}</span>
                <button className="text-brand hover:underline" onClick={() => onFocus(c.p)}>Show on map</button>
              </div>
            </div>
            {!closed && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.status === "received" && (
                  <select className="rounded-lg border border-line2 bg-panel px-2 py-1.5 text-xs" defaultValue="" disabled={busy === c.id} onChange={(e) => e.target.value && update(c, { status: "assessor", assessor: e.target.value })} aria-label="Assign assessor">
                    <option value="">Assign assessor…</option>
                    {ASSESSORS.map((a) => <option key={a}>{a}</option>)}
                  </select>
                )}
                {(c.status === "received" || c.status === "assessor") && (
                  <>
                    <input className="input !w-32 !py-1.5 text-xs" inputMode="numeric" placeholder="Amount (R)" value={amounts[c.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: e.target.value.replace(/[^\d]/g, "") }))} />
                    <button className="btn btn-primary !px-2.5 !py-1.5 text-xs" disabled={busy === c.id || !amounts[c.id]} onClick={() => update(c, { status: "approved", amount: Number(amounts[c.id]) })}>Approve</button>
                    <button className="btn btn-ghost !px-2.5 !py-1.5 text-xs" disabled={busy === c.id} onClick={() => update(c, { status: "rejected" })}>Decline</button>
                  </>
                )}
                {c.status === "approved" && (
                  <button className="btn btn-primary !px-2.5 !py-1.5 text-xs" disabled={busy === c.id} onClick={() => update(c, { status: "settled" })}>
                    Mark paid ({c.amount ? rand(c.amount) : ""})
                  </button>
                )}
                <a href={`tel:${c.phone}`} className="btn btn-ghost !px-2.5 !py-1.5 text-xs"><PhoneCall size={12} /> Call</a>
                {c.assessor && <span className="text-[11px] text-dim">{c.assessor}</span>}
              </div>
            )}
          </div>
        );
      })}
      <Modal open={!!photo} onClose={() => setPhoto(null)} title="Claim photo" wide>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="Claim photo" className="w-full rounded-lg" />}
      </Modal>
    </div>
  );
}
