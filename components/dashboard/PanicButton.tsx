"use client";
import { useState } from "react";
import { Ambulance, Check, Home, LifeBuoy, Loader2, MapPin, MoreHorizontal, Phone, Siren, Waves } from "lucide-react";
import { Modal } from "../ui";
import { api, getPosition } from "@/lib/client";
import { TICKET_TYPES, type TicketType } from "@/lib/risk";
import type { PublicUser } from "@/lib/users";
import { clock } from "@/lib/format";

const OPTIONS: { type: TicketType; icon: React.ComponentType<{ size?: number }>; sub: string }[] = [
  { type: "medical", icon: Ambulance, sub: "Injury, illness or medication needed" },
  { type: "rescue", icon: LifeBuoy, sub: "Trapped, water rising around you" },
  { type: "flooded", icon: Home, sub: "Water inside your home" },
  { type: "stranded", icon: Waves, sub: "Cut off by water, cannot leave" },
  { type: "other", icon: MoreHorizontal, sub: "Something else" },
];

type Sent = { ref: string; createdAt: string; lat: number; lng: number; accuracy: number | null };

export default function PanicButton({ user, onSent }: { user: PublicUser; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TicketType | null>(null);
  const [people, setPeople] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"gps" | "send" | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number | null; source: string } | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setOpen(true);
    setSent(null);
    setType(null);
    setErr(null);
    setNote("");
    setPeople(1);
    setBusy("gps");
    try {
      const p = await getPosition(7000);
      setPos({ ...p, source: "GPS" });
    } catch {
      const fb = user.gps ?? user.home;
      setPos({ lat: fb[0], lng: fb[1], accuracy: null, source: user.gps ? "last shared GPS" : "home address" });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!type) return;
    setBusy("send");
    setErr(null);
    try {
      const r = await api<{ ticket: Sent }>("/api/tickets", { body: { type, people, note, lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy } });
      setSent(r.ticket);
      onSent();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        onClick={start}
        className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-danger/50 bg-gradient-to-br from-[#b91c1c] to-[#7f1d1d] p-4 text-left shadow-[0_10px_40px_rgba(239,68,68,.25)] transition hover:brightness-110 active:scale-[.99]"
        aria-label="Panic button: request emergency help"
      >
        <span className="relative grid h-16 w-16 shrink-0 place-items-center">
          <span className="pulse-ring absolute inset-0 rounded-full bg-white/40" />
          <span className="relative grid h-14 w-14 place-items-center rounded-full bg-white text-danger shadow-lg">
            <Siren size={28} strokeWidth={2.4} />
          </span>
        </span>
        <span>
          <span className="block text-xl font-extrabold tracking-tight text-white">EMERGENCY</span>
          <span className="block text-sm text-red-100/90">Tap for rescue, medical or flood help</span>
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={sent ? "Help is on the way" : "What do you need?"} tone="danger">
        {sent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-safe/40 bg-safe/10 p-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-safe text-[#05210f]">
                <Check size={22} strokeWidth={3} />
              </div>
              <div>
                <div className="font-semibold">Ticket {sent.ref} received</div>
                <div className="text-xs text-mute">Sent at {clock(sent.createdAt)} · responders can see your location</div>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-fg/90">
              <li>• Stay where you are if it is safe. Move to the highest point you can reach (an upper floor or the roof).</li>
              <li>• Do not walk or drive through moving water.</li>
              <li>• {user.emergencyName} has been sent an SMS with your location.</li>
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <a href="tel:112" className="btn btn-danger">
                <Phone size={16} /> Call 112
              </a>
              <a href="tel:10177" className="btn btn-ghost">
                <Phone size={16} /> Ambulance 10177
              </a>
            </div>
            <button className="btn btn-ghost w-full" onClick={() => setOpen(false)}>
              Close. Track this ticket on your dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              {OPTIONS.map((o) => (
                <button
                  key={o.type}
                  onClick={() => setType(o.type)}
                  aria-pressed={type === o.type}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${type === o.type ? "border-danger bg-danger/15" : "border-line2 bg-black/20 hover:border-dim"}`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${type === o.type ? "bg-danger text-white" : "bg-white/5 text-fg/80"}`}>
                    <o.icon size={20} />
                  </span>
                  <span>
                    <span className="block font-semibold">{TICKET_TYPES[o.type]}</span>
                    <span className="block text-xs text-mute">{o.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            {type && (
              <div className="rise space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">People with you</span>
                  <div className="flex items-center gap-1">
                    <button className="btn btn-ghost !h-9 !w-9 !p-0" onClick={() => setPeople((p) => Math.max(1, p - 1))} aria-label="Fewer people">−</button>
                    <span className="w-8 text-center font-mono text-lg tabular">{people}</span>
                    <button className="btn btn-ghost !h-9 !w-9 !p-0" onClick={() => setPeople((p) => Math.min(50, p + 1))} aria-label="More people">+</button>
                  </div>
                </div>
                <textarea className="input min-h-[60px] text-sm" placeholder="Anything responders should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </div>
            )}
            <div className="rounded-xl border border-line bg-black/30 p-3 text-xs">
              <div className="mb-1 font-semibold uppercase tracking-wider text-dim">Sent with your request</div>
              <div className="flex items-center gap-2 text-fg/85">
                <MapPin size={13} className="text-brand" />
                {busy === "gps" ? (
                  <span className="flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Getting your GPS position…
                  </span>
                ) : pos ? (
                  <span className="font-mono">
                    {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)} <span className="font-sans text-dim">({pos.source}{pos.accuracy ? ` ±${Math.round(pos.accuracy)} m` : ""})</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-mute">
                {user.firstName} {user.surname} · {user.phone}
                {user.vulnerable.length > 0 && <> · vulnerable: {user.vulnerable.join(", ")}</>}
                {user.medical && <> · medical info</>}
              </div>
              <div className="text-mute">Time stamp added when you send</div>
            </div>
            {err && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-red-200">{err}</div>}
            <button className="btn btn-danger w-full !py-3 text-base" disabled={!type || busy !== null} onClick={send}>
              {busy === "send" ? <Loader2 size={18} className="animate-spin" /> : <Siren size={18} />} Send emergency request
            </button>
            <p className="text-center text-xs text-dim">If you can, also call 112. StormShield does not replace emergency services.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
