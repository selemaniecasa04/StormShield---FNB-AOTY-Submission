"use client";
import Link from "next/link";
import { useState } from "react";
import { Camera, Car, CheckCircle2, FileText, Loader2, ShieldCheck, Trash2, Umbrella } from "lucide-react";
import { api, getPosition } from "@/lib/client";
import { CLAIM_FLOW, CLAIM_STATUS_LABEL, COVER, rand, type Cover } from "@/lib/insurance";
import { timeAgo } from "@/lib/format";
import type { MyInsurance } from "@/lib/types";
import { Field, Modal, PanelHead } from "../ui";

/** Shrink a photo in the browser before upload (max 1024 px, JPEG). */
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.72;
    let out = c.toDataURL("image/jpeg", q);
    while (out.length > 430_000 && q > 0.3) {
      q -= 0.12;
      out = c.toDataURL("image/jpeg", q);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Insurance({ ins, onChange }: { ins: MyInsurance | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!ins) {
    return (
      <div className="panel p-5">
        <PanelHead icon={<Umbrella size={13} />} title="Insurance" />
        <p className="text-sm text-fg/85">Link your home or car insurance to StormShield. Your insurer can warn you early, see that you protected your property, and process flood claims faster using the flood data for your address.</p>
        <Link href="/profile#insurance" className="btn btn-primary mt-4">
          <ShieldCheck size={16} /> Link my policy
        </Link>
      </div>
    );
  }
  const mitigate = async () => {
    setBusy(true);
    try {
      await api("/api/me/mitigate", { body: {} });
      onChange();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel overflow-hidden">
        <div className="bg-gradient-to-br from-brand/15 via-transparent to-transparent p-5">
          <PanelHead icon={<Umbrella size={13} />} title="Your policy" />
          <div className="text-xl font-semibold">{ins.insurer}</div>
          <div className="font-mono text-sm text-mute">{ins.policyNo}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ins.cover.map((c) => (
              <span key={c} className="rounded-full border border-line2 px-2.5 py-0.5 text-xs">
                {COVER[c as Cover]}
              </span>
            ))}
          </div>
          {ins.vehicle && <div className="mt-2 flex items-center gap-1.5 text-xs text-mute"><Car size={13} /> {ins.vehicle}</div>}
          <div className="mt-3 text-[11px] text-dim">{ins.consent ? `${ins.insurer} can see your alerts, call responses and flood risk for your home.` : "Data sharing with your insurer is off."}</div>
        </div>
        <div className="border-t border-line p-5">
          <div className="label mb-2">Before the water arrives</div>
          {ins.mitigatedAt ? (
            <div className="flex items-center gap-2 rounded-xl border border-safe/40 bg-safe/10 p-3 text-sm">
              <CheckCircle2 size={18} className="text-safe" /> You confirmed your vehicle and valuables are safe ({timeAgo(ins.mitigatedAt)}).
            </div>
          ) : (
            <button onClick={mitigate} disabled={busy} className="btn btn-ghost w-full justify-start !py-3 text-left">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Car size={18} className="text-brand" />}
              <span>
                <span className="block">I&apos;ve moved my vehicle and valuables to safety</span>
                <span className="block text-xs font-normal text-mute">Tells your insurer you took action to prevent loss</span>
              </span>
            </button>
          )}
          {ins.portal && (
            <button onClick={() => setOpen(true)} className="btn btn-primary mt-3 w-full">
              <FileText size={16} /> Report flood damage
            </button>
          )}
        </div>
      </div>
      <div className="panel p-5">
        <PanelHead icon={<FileText size={13} />} title="Your claims" />
        {ins.claims.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line2 p-4 text-center text-sm text-mute">No claims. If your property is damaged, report it here with photos. Flood data for your address is attached automatically.</div>
        ) : (
          <ul className="space-y-3">
            {ins.claims.map((c) => {
              const idx = CLAIM_FLOW.indexOf(c.status as (typeof CLAIM_FLOW)[number]);
              return (
                <li key={c.id} className="rounded-xl border border-line bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      {c.ref} · {COVER[c.kind as Cover] ?? c.kind}
                    </div>
                    <span className="text-[11px] text-dim">{timeAgo(c.created_at)}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-mute">{c.description}</div>
                  {c.status === "rejected" ? (
                    <div className="mt-2 text-xs font-semibold text-red-300">Declined. An agent will call you.</div>
                  ) : (
                    <ol className="mt-2 grid grid-cols-4 gap-1">
                      {CLAIM_FLOW.map((s, i) => (
                        <li key={s} className="text-center">
                          <div className={`h-1.5 rounded-full ${i <= idx ? "bg-brand" : "bg-white/10"}`} />
                          <div className={`mt-1 text-[10px] leading-tight ${i <= idx ? "text-fg" : "text-dim"}`}>{CLAIM_STATUS_LABEL[s]}</div>
                        </li>
                      ))}
                    </ol>
                  )}
                  {c.amount ? <div className="mt-2 text-xs">Approved amount: <b>{rand(c.amount)}</b></div> : null}
                  {c.assessor && <div className="text-xs text-mute">Assessor: {c.assessor}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ClaimForm open={open} onClose={() => setOpen(false)} ins={ins} onDone={onChange} />
    </div>
  );
}

function ClaimForm({ open, onClose, ins, onDone }: { open: boolean; onClose: () => void; ins: MyInsurance; onDone: () => void }) {
  const [kind, setKind] = useState<string>(ins.cover[0] ?? "contents");
  const [description, setDescription] = useState("");
  const [depth, setDepth] = useState(40);
  const [photos, setPhotos] = useState<string[]>([]);
  const [where, setWhere] = useState<"home" | "here">("home");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const add = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, 3 - photos.length);
    const out: string[] = [];
    for (const f of list) {
      try {
        out.push(await compress(f));
      } catch {
        /* skip unreadable */
      }
    }
    setPhotos((p) => [...p, ...out].slice(0, 3));
  };
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      let lat: number | undefined, lng: number | undefined;
      if (where === "here") {
        const p = await getPosition();
        lat = p.lat;
        lng = p.lng;
      }
      const r = await api<{ ref: string }>("/api/claims", { body: { kind, description, depthCm: depth, photos, lat, lng } });
      setRef(r.ref);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    onClose();
    setRef(null);
    setDescription("");
    setPhotos([]);
  };
  return (
    <Modal open={open} onClose={close} title={ref ? "Claim submitted" : `Report damage to ${ins.insurer}`}>
      {ref ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 rounded-xl border border-safe/40 bg-safe/10 p-3">
            <CheckCircle2 className="text-safe" /> Claim <b>{ref}</b> received.
          </div>
          <p className="text-mute">The flood model data for that location (water extent, depth and the alerts you received) has been attached to your claim, so the assessor can process it faster.</p>
          <button className="btn btn-ghost w-full" onClick={close}>Close</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[13px] font-medium">What was damaged?</div>
            <div className="flex flex-wrap gap-1.5">
              {ins.cover.map((c) => (
                <button key={c} onClick={() => setKind(c)} aria-pressed={kind === c} className={`rounded-full border px-3 py-1.5 text-sm ${kind === c ? "border-brand bg-brand/15" : "border-line2"}`}>
                  {COVER[c as Cover]}
                </button>
              ))}
            </div>
          </div>
          <Field label="What happened?">
            <textarea className="input min-h-[80px] text-sm" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="e.g. Water came into the lounge about knee height. Couch and fridge damaged." />
          </Field>
          <div>
            <div className="mb-1 flex justify-between text-[13px] font-medium">
              <span>How deep was the water?</span>
              <span className="font-mono text-brand">{depth} cm</span>
            </div>
            <input type="range" min={0} max={250} step={5} value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full accent-[#3cc7f5]" />
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-medium">Where?</div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1 text-sm">
              {(["home", "here"] as const).map((w) => (
                <button key={w} onClick={() => setWhere(w)} className={`rounded-md py-1.5 ${where === w ? "bg-white/10" : "text-mute"}`}>
                  {w === "home" ? "At my home" : "Where I am now"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-medium">Photos (up to 3)</div>
            <div className="flex gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-line2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt={`Damage photo ${i + 1}`} className="h-full w-full object-cover" />
                  <button onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-black/70 p-0.5" aria-label="Remove photo">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {photos.length < 3 && (
                <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-line2 text-mute hover:text-fg">
                  <Camera size={20} />
                  <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
                </label>
              )}
            </div>
          </div>
          {err && <div className="text-sm text-danger">{err}</div>}
          <button className="btn btn-primary w-full" onClick={submit} disabled={busy || description.trim().length < 10}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Submit claim
          </button>
        </div>
      )}
    </Modal>
  );
}
