"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Phone, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/client";
import { KEY_INFO, OUTREACH, type Key } from "@/lib/outreach-text";
import type { ActiveCall } from "@/lib/types";
import { Logo } from "./ui";

/** Plays a phone-style double ring with Web Audio while `on` is true. */
export function useRingtone(on: boolean, muted: boolean) {
  useEffect(() => {
    if (!on || muted) return;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const ring = () => {
        if (!ctx) return;
        const t = ctx.currentTime;
        for (const start of [0, 0.5]) {
          const o1 = ctx.createOscillator();
          const o2 = ctx.createOscillator();
          const g = ctx.createGain();
          o1.frequency.value = 440;
          o2.frequency.value = 480;
          g.gain.setValueAtTime(0, t + start);
          g.gain.linearRampToValueAtTime(0.06, t + start + 0.02);
          g.gain.setValueAtTime(0.06, t + start + 0.38);
          g.gain.linearRampToValueAtTime(0, t + start + 0.4);
          o1.connect(g);
          o2.connect(g);
          g.connect(ctx.destination);
          o1.start(t + start);
          o2.start(t + start);
          o1.stop(t + start + 0.42);
          o2.stop(t + start + 0.42);
        }
      };
      ring();
      timer = setInterval(ring, 3000);
    } catch {
      /* audio not available */
    }
    return () => {
      if (timer) clearInterval(timer);
      ctx?.close().catch(() => {});
    };
  }, [on, muted]);
}

export default function PhoneCall({ call, onChange }: { call: ActiveCall | null; onChange: () => void }) {
  const [mode, setMode] = useState<"ringing" | "in_call" | "done" | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [english, setEnglish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ key: Key; ticket: string | null } | null>(null);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const last = useRef<ActiveCall | null>(null);

  useEffect(() => {
    if (call) {
      last.current = call;
      if (call.id !== id) {
        setId(call.id);
        setMode(call.status);
        setEnglish(false);
        setDone(null);
      } else if (mode !== "done" && call.status === "in_call") setMode("in_call");
    } else if (mode && mode !== "done") {
      setMode(null); // timed out or answered elsewhere
    }
  }, [call, id, mode]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useRingtone(mode === "ringing", muted);
  useEffect(() => {
    if (mode === "ringing" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.([400, 200, 400]);
      } catch {
        /* ignore */
      }
    }
  }, [mode, id]);

  const c = call ?? last.current;
  if (!mode || !c) return null;

  const act = async (action: "answer" | "decline" | "key", key?: Key) => {
    if (key === "5") {
      setEnglish(true);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ ticket: string | null }>("/api/outreach/respond", { body: { targetId: c.id, action, key } });
      if (action === "answer") setMode("in_call");
      if (action === "decline") setMode(null);
      if (action === "key" && key) {
        setDone({ key, ticket: r.ticket });
        setMode("done");
        setTimeout(() => setMode((m) => (m === "done" ? null : m)), 6000);
      }
      onChange();
    } catch {
      setMode(null);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const ringLeft = c.ringAt ? Math.max(0, Math.ceil(OUTREACH.ringSec - (now - new Date(c.ringAt).getTime()) / 1000)) : OUTREACH.ringSec;
  const danger = c.kind === "evacuate";

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Incoming StormShield call">
      <div className="rise relative flex max-h-[100dvh] min-h-[600px] w-full max-w-[360px] flex-col overflow-y-auto rounded-t-[36px] thin-scroll border border-line2 bg-gradient-to-b from-[#0d1722] to-[#060a0f] shadow-[0_30px_80px_rgba(0,0,0,.7)] sm:rounded-[40px]">
        <div className="mx-auto mt-3 h-1.5 w-24 rounded-full bg-white/15" />
        <div className="flex items-center justify-between px-6 pt-3 text-[11px] text-mute">
          <span>Demo phone</span>
          <button onClick={() => setMuted((m) => !m)} className="flex items-center gap-1 hover:text-fg" aria-label={muted ? "Unmute ringtone" : "Mute ringtone"}>
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />} {muted ? "Muted" : "Sound"}
          </button>
        </div>

        <div className={`flex flex-col items-center px-6 text-center ${mode === "in_call" ? "pt-2" : "pt-6"}`}>
          <div className={`relative grid place-items-center rounded-full ${mode === "in_call" ? "h-12 w-12" : "h-20 w-20"} ${danger ? "bg-danger/20" : "bg-warn/20"}`}>
            {mode === "ringing" && <span className={`pulse-ring absolute inset-0 rounded-full ${danger ? "bg-danger/40" : "bg-warn/40"}`} />}
            <Logo size={mode === "in_call" ? 28 : 44} />
          </div>
          <div className={`font-semibold ${mode === "in_call" ? "mt-2 text-base" : "mt-4 text-xl"}`}>{c.insurer ? `${c.insurer} via StormShield` : "StormShield Alerts"}</div>
          <div className="text-sm text-mute">+27 31 000 0911 · {danger ? "Evacuation call" : "Flood warning call"}</div>
          <div className="mt-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-mute">
            Call {c.attempt} of {OUTREACH.maxAttempts}
          </div>
        </div>

        {mode === "ringing" && (
          <>
            <div className="mt-6 px-6 text-center text-sm text-mute">
              Incoming call… <span className="font-mono">{ringLeft}s</span>
              <div className="mt-1 text-[11px] text-dim">If you don&apos;t answer, StormShield SMSes you and calls again ({c.attempt < 3 ? `call ${c.attempt + 1} of 3` : "then alerts your family"}).</div>
            </div>
            <div className="mt-auto flex items-center justify-around px-10 pb-12">
              <button onClick={() => act("decline")} disabled={busy} className="flex flex-col items-center gap-2 text-xs text-mute">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-danger text-white shadow-lg">
                  <PhoneOff size={26} />
                </span>
                Decline
              </button>
              <button onClick={() => act("answer")} disabled={busy} className="flex flex-col items-center gap-2 text-xs text-mute">
                <span className="grid h-16 w-16 animate-bounce place-items-center rounded-full bg-safe text-[#05210f] shadow-lg">
                  <Phone size={26} />
                </span>
                Answer
              </button>
            </div>
          </>
        )}

        {mode === "in_call" && (
          <div className="flex flex-1 flex-col px-5 pb-6 pt-4">
            <div className="rounded-2xl border border-line2 bg-black/30 p-3 text-sm leading-relaxed">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-dim">{english ? "Message (English)" : "Message"}</div>
              {english ? c.script.english : c.script.local}
              {!english && <div className="mt-2 border-t border-white/10 pt-2 text-xs text-mute">{c.script.english}</div>}
            </div>
            <div className="mt-3 text-center text-[11px] text-dim">Press a key to respond</div>
            <div className="mt-2 grid gap-1.5">
              {c.menu.map((m) => (
                <button
                  key={m.key}
                  onClick={() => act("key", m.key as Key)}
                  disabled={busy}
                  className="flex items-center gap-3 rounded-xl border border-line2 bg-white/[.03] px-3 py-2 text-left transition hover:bg-white/[.08] active:scale-[.98]"
                  style={{ borderColor: `${KEY_INFO[m.key as Key].color}55` }}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-lg font-bold" style={{ background: `${KEY_INFO[m.key as Key].color}22`, color: KEY_INFO[m.key as Key].color }}>
                    {m.key}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{m.local}</span>
                    {m.local !== m.english && <span className="block text-[11px] text-mute">{m.english}</span>}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => act("decline")} className="mx-auto mt-auto grid h-12 w-12 place-items-center rounded-full bg-danger text-white" aria-label="Hang up">
              <PhoneOff size={20} />
            </button>
          </div>
        )}

        {mode === "done" && done && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
            <CheckCircle2 size={48} style={{ color: KEY_INFO[done.key].color }} />
            <div className="mt-3 text-lg font-semibold">You pressed {done.key}</div>
            <div className="mt-1 text-sm text-fg/85">{KEY_INFO[done.key].effect}.</div>
            {done.ticket && <div className="mt-2 rounded-lg bg-danger/15 px-3 py-1.5 text-sm font-semibold text-red-300">Help request {done.ticket}</div>}
            <div className="mt-3 text-xs text-mute">Responders, your family and the command centre can see this now.</div>
            <button onClick={() => setMode(null)} className="btn btn-ghost mt-6">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
