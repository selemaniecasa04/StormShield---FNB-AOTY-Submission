"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { Modal } from "../ui";
import { api } from "@/lib/client";
import { UNIT_TYPES, etaMinutes, recommendType, type UnitRow, type UnitType } from "@/lib/dispatch";
import { TICKET_TYPES, type TicketType } from "@/lib/risk";
import type { LatLng } from "@/lib/geo";

export interface DispatchTarget {
  ticketId?: number;
  ref?: string;
  type: string;
  p: LatLng;
  name: string;
  /** When set, a new request is logged for this resident first. */
  createFor?: { userId: number; targetId?: number };
}

export default function DispatchModal({ target, onClose, onDone }: { target: DispatchTarget | null; onClose: () => void; onDone: () => void }) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [type, setType] = useState<UnitType>("dm");
  const [reqType, setReqType] = useState<string>("welfare");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setErr(null);
    setType(recommendType(target.type));
    setReqType(target.type);
    api<{ units: UnitRow[] }>("/api/admin/dispatch").then((r) => setUnits(r.units)).catch(() => setUnits([]));
  }, [target]);

  const list = useMemo(() => {
    if (!target) return [];
    return units
      .filter((u) => u.type === type)
      .map((u) => ({ ...u, eta: etaMinutes(u.base, target.p, u.type) }))
      .sort((a, b) => (a.status === "available" ? 0 : 1) - (b.status === "available" ? 0 : 1) || a.eta - b.eta);
  }, [units, type, target]);

  const send = async (unitId: string | null) => {
    if (!target) return;
    setBusy(unitId ?? "log");
    setErr(null);
    try {
      if (target.createFor) {
        await api("/api/admin/dispatch", { body: { action: "create", userId: target.createFor.userId, targetId: target.createFor.targetId, type: reqType, unitId: unitId ?? undefined } });
      } else {
        await api("/api/admin/dispatch", { body: { action: "dispatch", ticketId: target.ticketId, unitId } });
      }
      onDone();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={!!target} onClose={onClose} title={target?.ref ? `Dispatch to ${target.ref}` : `Send emergency services to ${target?.name ?? ""}`} wide>
      {target && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-black/20 p-3 text-sm">
            <b>{target.name}</b>
            <span className="text-mute"> · {target.p[0].toFixed(4)}, {target.p[1].toFixed(4)}</span>
            {!target.createFor && <div className="text-xs text-mute">{TICKET_TYPES[target.type as TicketType] ?? target.type}</div>}
          </div>
          {target.createFor && (
            <label className="block text-xs font-medium text-mute">
              Request type
              <select className="input mt-1 text-sm" value={reqType} onChange={(e) => { setReqType(e.target.value); setType(recommendType(e.target.value)); }}>
                {(["welfare", "transport", "rescue", "medical", "flooded", "stranded", "other"] as TicketType[]).map((t) => (
                  <option key={t} value={t}>{TICKET_TYPES[t]}</option>
                ))}
              </select>
            </label>
          )}
          <div>
            <div className="mb-1.5 text-xs font-medium text-mute">Service (recommended: {UNIT_TYPES[recommendType(reqType)].label})</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(UNIT_TYPES) as UnitType[]).map((t) => (
                <button key={t} onClick={() => setType(t)} aria-pressed={type === t} className="rounded-full border px-3 py-1 text-xs font-semibold transition" style={{ borderColor: type === t ? UNIT_TYPES[t].color : "var(--color-line2)", background: type === t ? `${UNIT_TYPES[t].color}22` : undefined }}>
                  {UNIT_TYPES[t].short}
                </button>
              ))}
            </div>
          </div>
          <ul className="space-y-2">
            {list.map((u) => (
              <li key={u.id} className={`flex items-center gap-3 rounded-xl border p-3 ${u.status === "available" ? "border-line2" : "border-line opacity-60"}`}>
                <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${UNIT_TYPES[u.type].color}22`, color: UNIT_TYPES[u.type].color }}>
                  <Truck size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{u.name}</div>
                  <div className="text-xs text-mute">{u.status === "available" ? "Available" : `Busy · ${u.ticketRef}`}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold">{u.eta} min</div>
                  <div className="text-[10px] text-dim">ETA</div>
                </div>
                <button className="btn btn-primary !px-3 !py-1.5 text-xs" disabled={u.status !== "available" || !!busy} onClick={() => send(u.id)}>
                  {busy === u.id ? <Loader2 size={13} className="animate-spin" /> : null} Dispatch
                </button>
              </li>
            ))}
          </ul>
          {target.createFor && (
            <button className="btn btn-ghost w-full text-sm" disabled={!!busy} onClick={() => send(null)}>
              {busy === "log" ? <Loader2 size={14} className="animate-spin" /> : null} Log request only (dispatch later)
            </button>
          )}
          {err && <div className="text-sm text-danger">{err}</div>}
          <p className="text-[11px] text-dim">The resident sees the unit, ETA and progress on their dashboard and gets an SMS. The unit gets the location by SMS.</p>
        </div>
      )}
    </Modal>
  );
}
