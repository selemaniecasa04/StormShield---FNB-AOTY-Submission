"use client";
import { useState } from "react";
import { BellRing, ExternalLink, Link2, Loader2, MoreVertical, Phone, Plus, Trash2, UsersRound } from "lucide-react";
import { Empty, Field, LevelPill, Modal, PanelHead } from "../ui";
import { api } from "@/lib/client";
import type { FamilyMember } from "@/lib/types";
import { CHECK_META, type CheckStatus } from "@/lib/risk";
import { timeAgo } from "@/lib/format";

const STATUS: Record<string, { label: string; color: string }> = {
  safe: { label: "Safe", color: "#22c55e" },
  evacuating: { label: "Evacuating", color: "#facc15" },
  need_help: { label: "Needs assistance", color: "#ef4444" },
  vulnerable_present: { label: "Vulnerable person present", color: "#a78bfa" },
  pending: { label: "Pending", color: "#8b9db0" },
};

export default function Family({ family, onChange }: { family: FamilyMember[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const [links, setLinks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const counts = family.reduce<Record<string, number>>((a, f) => ((a[f.status] = (a[f.status] ?? 0) + 1), a), {});

  const ping = async (f: FamilyMember) => {
    setBusy(f.id);
    try {
      const r = await api<{ link: string }>(`/api/family/${f.id}/ping`, { body: {} });
      setLinks((l) => ({ ...l, [f.id]: r.link }));
      onChange();
    } finally {
      setBusy(null);
    }
  };
  const setStatus = async (f: FamilyMember, status: string) => {
    setMenu(null);
    await api(`/api/family/${f.id}`, { method: "PATCH", body: { status } });
    onChange();
  };
  const remove = async (f: FamilyMember) => {
    setMenu(null);
    if (!confirm(`Remove ${f.name} from your family circle?`)) return;
    await api(`/api/family/${f.id}`, { method: "DELETE" });
    onChange();
  };

  return (
    <div className="panel p-5">
      <PanelHead
        icon={<UsersRound size={13} />}
        title="Family safety"
        sub={
          family.length ? (
            <span>
              <span className="text-safe">{(counts.safe ?? 0) + (counts.evacuating ?? 0)} safe or moving</span> · <span className="text-mute">{counts.pending ?? 0} pending</span>
              {counts.need_help ? <span className="text-danger"> · {counts.need_help} need help</span> : null}
            </span>
          ) : undefined
        }
        right={
          <button onClick={() => setAdding(true)} className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
            <Plus size={14} /> Add
          </button>
        }
      />
      {family.length === 0 ? (
        <Empty>Add the people you&apos;d worry about in a flood. We&apos;ll show you when they&apos;re safe.</Empty>
      ) : (
        <ul className="space-y-2">
          {family.map((f) => {
            const st = STATUS[f.status] ?? STATUS.pending;
            return (
              <li key={f.id} className="relative rounded-xl border border-line bg-black/20 p-3">
                <div className="flex items-center gap-3">
                  <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[.06] text-sm font-semibold">
                    {f.name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")}
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel" style={{ background: st.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{f.name}</span>
                      {f.isContact && <span className="shrink-0 rounded bg-brand/15 px-1 text-[9px] font-bold uppercase tracking-wider text-brand">SOS</span>}
                    </div>
                    <div className="truncate text-[11px] text-dim">
                      {f.relation}
                      {f.linked ? (f.basicPhone ? " · basic phone (USSD)" : " · on StormShield") : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold" style={{ color: st.color }}>
                      {st.label}
                    </div>
                    <div className="text-[10px] text-dim">{f.statusAt ? timeAgo(f.statusAt) : f.pingedAt ? `asked ${timeAgo(f.pingedAt)}` : "no reply yet"}</div>
                  </div>
                  <button onClick={() => setMenu(menu === f.id ? null : f.id)} className="rounded p-1 text-dim hover:bg-white/5 hover:text-fg" aria-label={`Options for ${f.name}`}>
                    <MoreVertical size={16} />
                  </button>
                </div>
                {f.zone && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-mute">
                    Their area: <LevelPill level={f.zone.level}>{f.zone.name} · {f.zone.category.toLowerCase()}</LevelPill>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!f.linked && f.status !== "safe" && (
                    <button onClick={() => ping(f)} disabled={busy === f.id} className="btn btn-ghost !px-2 !py-1 text-[11px]">
                      {busy === f.id ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />} Ask to check in
                    </button>
                  )}
                  <a href={`tel:${f.phone}`} className="btn btn-ghost !px-2 !py-1 text-[11px]">
                    <Phone size={12} /> Call
                  </a>
                  {links[f.id] && (
                    <a href={links[f.id]} target="_blank" rel="noreferrer" className="btn btn-ghost !px-2 !py-1 text-[11px] text-brand">
                      <ExternalLink size={12} /> Open their check-in link
                    </a>
                  )}
                </div>
                {links[f.id] && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-dim">
                    <Link2 size={10} /> SMS sent with a one-tap link (see Messages). Demo: open it to reply as {f.name.split(" ")[0]}.
                  </div>
                )}
                {menu === f.id && (
                  <div className="rise absolute right-2 top-11 z-20 w-56 overflow-hidden rounded-xl border border-line2 bg-panel shadow-2xl">
                    {!f.linked && (
                      <>
                        <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-dim">Mark status (after a call)</div>
                        {(["safe", "evacuating", "need_help", "vulnerable_present"] as CheckStatus[]).map((s) => (
                          <button key={s} onClick={() => setStatus(f, s)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/5">
                            <span className="h-2 w-2 rounded-full" style={{ background: CHECK_META[s].color }} /> {s === "need_help" ? "Needs assistance" : CHECK_META[s].label.replace("I am", "Is")}
                          </button>
                        ))}
                        <button onClick={() => setStatus(f, "pending")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/5">
                          <span className="h-2 w-2 rounded-full bg-mute" /> Reset to pending
                        </button>
                      </>
                    )}
                    <button onClick={() => remove(f)} className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm text-red-300 hover:bg-white/5">
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AddMember open={adding} onClose={() => setAdding(false)} onAdded={onChange} />
    </div>
  );
}

function AddMember({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("Mother");
  const [phone, setPhone] = useState("");
  const [isContact, setIsContact] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ linked: boolean }>("/api/family", { body: { name, relation, phone, isContact } });
      onAdded();
      onClose();
      setName("");
      setPhone("");
      setIsContact(false);
      if (r.linked) alert(`${name} already uses StormShield, so their check-ins will appear automatically.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a family member or contact">
      <div className="space-y-3">
        <Field label="Name" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relationship">
            <select className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
              {["Mother", "Father", "Grandparent", "Partner", "Son", "Daughter", "Brother", "Sister", "Neighbour", "Friend", "Carer", "Other"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Phone number" required>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="082 123 4567" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg/85">
          <input type="checkbox" checked={isContact} onChange={(e) => setIsContact(e.target.checked)} className="h-4 w-4 accent-[#3cc7f5]" />
          Also an emergency contact (notified if I press the panic button)
        </label>
        {err && <div className="text-sm text-danger">{err}</div>}
        <button className="btn btn-primary w-full" onClick={save} disabled={busy || !name || !phone}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add to family circle
        </button>
      </div>
    </Modal>
  );
}
