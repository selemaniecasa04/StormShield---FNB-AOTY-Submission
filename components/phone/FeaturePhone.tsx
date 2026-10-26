"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRingtone } from "../PhoneCall";
import { api } from "@/lib/client";
import { USSD_CODE } from "@/lib/emergency";
import { OUTREACH } from "@/lib/outreach-text";

export interface PhoneData {
  phone: string;
  now: string;
  subscriber: {
    name: string; firstName: string; channel: string; language: string; langCode: string; area: string | null; address: string; vulnerable: string;
    level: "green" | "yellow" | "orange" | "red" | null; score: number | null; category: string | null; watchers: string[];
    checkin: { status: string; note: string | null; created_at: string } | null;
  } | null;
  call: {
    id: number; status: "ringing" | "in_call"; attempt: number; ringAt: string | null; kind: "warning" | "evacuate"; title: string; insurer: string | null;
    script: { local: string; english: string }; menu: { key: string; local: string; english: string }[];
  } | null;
  nextCallAt: string | null;
  inbox: { id: number; at: string; body: string }[];
  voice: { id: number; at: string; body: string }[];
  tickets: { ref: string; type: string; status: string; rawStatus: string; priority: string; people: number; team: string | null; etaAt: string | null; source: string; at: string }[];
  sessions: { id: number; channel: string; startedAt: string; endedAt: string | null; updatedAt: string; outcome: string | null; label: string | null; ticket: string | null; steps: { at: string; in: string | null; out: string; end: boolean }[] }[];
}

type Question = { id: string; text: string; english: string; options: { key: string; label: string }[] | null };
export type CallView = { targetId: number; stage: "incoming" | "menu" | "question" | "done"; script: { local: string; english: string }; menu: { key: string; local: string; english: string }[]; question?: Question; effect?: string; ticket?: string | null; goodbye?: string; startedAt: number; attempt: number; kind: string; insurer: string | null; english: boolean };

type Mode = "home" | "menu" | "dial" | "ussd" | "call" | "inbox" | "msg" | "outcall";

const KEYS: [string, string][] = [
  ["1", "∞"], ["2", "abc"], ["3", "def"], ["4", "ghi"], ["5", "jkl"], ["6", "mno"], ["7", "pqrs"], ["8", "tuv"], ["9", "wxyz"], ["*", "+"], ["0", "␣"], ["#", "⇧"],
];
const MULTI: Record<string, string> = { "2": "abc", "3": "def", "4": "ghi", "5": "jkl", "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz", "0": " " };
const EMERGENCY = ["112", "10177", "10111", "0313610000"];

function beep(kind: "sms" | "key") {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const t = ctx.currentTime;
    const notes = kind === "sms" ? [[1318, 0], [1568, 0.14]] : [[880, 0]];
    for (const [f, s] of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(kind === "sms" ? 0.035 : 0.015, t + s);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s + (kind === "sms" ? 0.12 : 0.05));
      o.connect(g).connect(ctx.destination);
      o.start(t + s);
      o.stop(t + s + 0.15);
    }
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* no audio */
  }
}

const hhmm = (d: Date) => (d.getTime() ? d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--");
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function FeaturePhone({
  msisdn, data, refresh, sound, speak, onCall,
}: { msisdn: string; data: PhoneData | null; refresh: () => void; sound: boolean; speak: boolean; onCall: (c: CallView | null) => void }) {
  const [mode, setMode] = useState<Mode>("home");
  const [dial, setDial] = useState("");
  const [ussd, setUssd] = useState<{ sessionId: string; inputs: string[]; screen: string; end: boolean; busy: boolean; input: string } | null>(null);
  const [call, setCall] = useState<CallView | null>(null);
  const [sel, setSel] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [seen, setSeen] = useState<number>(-1);
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState(0); // set after mount so server and client render the same markup
  const [shift, setShift] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const multi = useRef<{ key: string; idx: number; at: number } | null>(null);
  const dismissed = useRef<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Reset when the SIM changes.
  useEffect(() => {
    setMode("home");
    setDial("");
    setUssd(null);
    setCall(null);
    setSeen(-1);
    dismissed.current = null;
  }, [msisdn]);

  useEffect(() => onCall(call), [call, onCall]);

  // New SMS: beep and show the envelope.
  const latest = data?.inbox[0]?.id ?? 0;
  useEffect(() => {
    if (!data || data.phone !== msisdn) return;
    if (seen === -1) {
      setSeen(latest);
      return;
    }
    if (latest > seen && mode !== "inbox" && mode !== "msg") {
      if (sound) beep("sms");
      setFlash("1 new message");
    }
  }, [latest, seen, data, msisdn, mode, sound]);
  const unread = data ? data.inbox.filter((m) => m.id > seen && seen !== -1).length : 0;

  // Incoming StormShield call.
  useEffect(() => {
    const c = data?.call;
    if (!c) {
      setCall((cur) => (cur && cur.stage === "incoming" ? null : cur));
      return;
    }
    if (c.status === "ringing" && dismissed.current !== c.id && (!call || call.targetId !== c.id) && (!call || call.stage === "done")) {
      setCall({ targetId: c.id, stage: "incoming", script: c.script, menu: c.menu, startedAt: Date.now(), attempt: c.attempt, kind: c.kind, insurer: c.insurer, english: false });
      setMode("call");
    }
  }, [data?.call, call]);

  useRingtone(!!call && call.stage === "incoming" && sound, false);

  // Optional: read the call aloud (English voice) so judges hear what a caller hears.
  const said = useRef<string>("");
  useEffect(() => {
    if (!speak || !call || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const text = call.stage === "menu" ? (call.english ? call.script.english : `${call.script.english}`) : call.stage === "question" ? call.question?.english : call.stage === "done" ? "Thank you. Your answers have been sent to the disaster management team. Goodbye." : "";
    if (!text || said.current === `${call.stage}:${text}`) return;
    said.current = `${call.stage}:${text}`;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-ZA";
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  }, [speak, call]);
  useEffect(() => {
    if ((!call || call.stage === "done" || call.stage === "incoming") && typeof window !== "undefined" && "speechSynthesis" in window) {
      if (!call || call.stage === "incoming") window.speechSynthesis.cancel();
    }
  }, [call]);

  // ---- Actions ----
  const sendUssd = useCallback(
    async (inputs: string[], sessionId: string) => {
      setUssd((u) => ({ sessionId, inputs, screen: u?.screen ?? "", end: false, busy: true, input: "" }));
      try {
        const body = new URLSearchParams({ sessionId, serviceCode: USSD_CODE, phoneNumber: msisdn, text: inputs.join("*"), networkCode: "65501" });
        const r = await fetch("/api/ussd", { method: "POST", body });
        const text = await r.text();
        const end = text.startsWith("END");
        setUssd({ sessionId, inputs, screen: text.replace(/^(CON|END)\s?/, ""), end, busy: false, input: "" });
        if (end) refresh();
      } catch {
        setUssd({ sessionId, inputs, screen: "Connection problem or invalid MMI code.", end: true, busy: false, input: "" });
      }
      scroll.current?.scrollTo({ top: 0 });
    },
    [msisdn, refresh],
  );

  const callAct = useCallback(
    async (action: string, key?: string) => {
      if (!call) return;
      try {
        const r = await api<{ stage: CallView["stage"]; question?: Question; effect?: string; ticket?: string | null; goodbye?: string; error?: string }>("/api/phone", { body: { msisdn, targetId: call.targetId, action, key } });
        if (action === "answer") setCall({ ...call, stage: "menu", startedAt: Date.now() });
        else if (action === "key" && key === "5") setCall({ ...call, english: true });
        else setCall({ ...call, stage: r.stage, question: r.question ?? call.question, effect: r.effect ?? call.effect, ticket: r.ticket ?? call.ticket, goodbye: r.goodbye });
        if (r.stage === "done") {
          dismissed.current = call.targetId;
          setTimeout(() => {
            setCall((c) => (c && c.targetId === call.targetId && c.stage === "done" ? null : c));
            setMode((m) => (m === "call" ? "home" : m));
          }, 5000);
        }
        refresh();
      } catch (e) {
        setCall({ ...call, stage: "done", goodbye: (e as Error).message || "Call ended." });
        dismissed.current = call.targetId;
        setTimeout(() => {
          setCall(null);
          setMode("home");
        }, 3000);
        refresh();
      }
    },
    [call, msisdn, refresh],
  );

  const startDial = () => {
    const n = dial.replace(/\s/g, "");
    if (!n) return;
    if (n.startsWith("*") && n.endsWith("#")) {
      if (n !== USSD_CODE) {
        setUssd({ sessionId: "x", inputs: [], screen: "Unknown application. Try " + USSD_CODE, end: true, busy: false, input: "" });
        setMode("ussd");
        return;
      }
      const sid = `sim-${msisdn.slice(-6)}-${Date.now().toString(36)}`;
      setMode("ussd");
      sendUssd([], sid);
    } else {
      setMode("outcall");
    }
  };

  const typeChar = (k: string) => {
    if (!ussd || ussd.end || ussd.busy) return;
    setUssd({ ...ussd, input: (ussd.input + k).slice(0, 80) });
  };

  const press = (k: string) => {
    if (sound) beep("key");
    // Phone keypad multi-tap letters in USSD free-text screens when shift (#) is on.
    if (mode === "ussd" && ussd && !ussd.end) {
      if (shift && MULTI[k]) {
        const m = multi.current;
        const t = Date.now();
        if (m && m.key === k && t - m.at < 900) {
          const letters = MULTI[k];
          const idx = (m.idx + 1) % letters.length;
          multi.current = { key: k, idx, at: t };
          setUssd({ ...ussd, input: ussd.input.slice(0, -1) + (ussd.input.length <= 1 ? letters[idx].toUpperCase() : letters[idx]) });
        } else {
          multi.current = { key: k, idx: 0, at: t };
          typeChar(ussd.input.length === 0 ? MULTI[k][0].toUpperCase() : MULTI[k][0]);
        }
        return;
      }
      if (k === "#") {
        setShift((s) => !s);
        multi.current = null;
        return;
      }
      typeChar(k);
      return;
    }
    if (mode === "call" && call) {
      if (call.stage === "menu" && /[1-5]/.test(k)) callAct("key", k);
      else if (call.stage === "question" && /[0-9]/.test(k)) callAct("answer_q", k);
      return;
    }
    if (mode === "home" || mode === "dial" || mode === "menu") {
      setMode("dial");
      setDial((d) => (d + k).slice(0, 20));
    }
  };

  const green = () => {
    if (mode === "call" && call?.stage === "incoming") return callAct("answer");
    if (mode === "dial") return startDial();
    if (mode === "ussd") return softLeft();
    if (mode === "home") {
      setDial(USSD_CODE);
      setMode("dial");
    }
  };

  const red = () => {
    if (mode === "call" && call) {
      if (call.stage === "incoming") return callAct("decline");
      if (call.stage === "done") {
        setCall(null);
        setMode("home");
        return;
      }
      return callAct("hangup");
    }
    setUssd(null);
    setDial("");
    setShift(false);
    setMode("home");
  };

  const inboxOpen = () => {
    setSel(0);
    setMode("inbox");
    setFlash(null);
    setSeen(latest);
  };

  const softLeft = () => {
    if (mode === "home") return setMode("menu");
    if (mode === "menu") {
      if (sel === 0) {
        setDial(USSD_CODE);
        setMode("dial");
      } else if (sel === 1) inboxOpen();
      else if (sel === 2) {
        setDial("112");
        setMode("dial");
      }
      return;
    }
    if (mode === "dial") return startDial();
    if (mode === "ussd" && ussd) {
      if (ussd.end) {
        setUssd(null);
        setMode("home");
        return;
      }
      if (!ussd.input || ussd.busy) return;
      setShift(false);
      sendUssd([...ussd.inputs, ussd.input.trim()], ussd.sessionId);
      return;
    }
    if (mode === "inbox" && data?.inbox.length) {
      setMsgIdx(sel);
      setMode("msg");
      return;
    }
    if (mode === "call" && call?.stage === "incoming") return callAct("answer");
    if (mode === "outcall") return setMode("home");
  };

  const softRight = () => {
    if (mode === "home") return inboxOpen();
    if (mode === "dial") {
      if (dial.length) setDial((d) => d.slice(0, -1));
      else setMode("home");
      return;
    }
    if (mode === "ussd" && ussd) {
      if (ussd.input) setUssd({ ...ussd, input: ussd.input.slice(0, -1) });
      else {
        setUssd(null);
        setMode("home");
      }
      return;
    }
    if (mode === "msg") return setMode("inbox");
    if (mode === "call" && call?.stage === "incoming") return callAct("decline");
    if (mode === "call" && call && call.stage !== "incoming") return callAct("hangup");
    setMode("home");
  };

  const nav = (dir: 1 | -1) => {
    if (mode === "menu") setSel((s) => (s + dir + 3) % 3);
    else if (mode === "inbox" && data?.inbox.length) setSel((s) => Math.max(0, Math.min(data.inbox.length - 1, s + dir)));
    else scroll.current?.scrollBy({ top: dir * 40, behavior: "smooth" });
  };

  // Keyboard: digits, * #, Enter = send/answer, Escape = end, Backspace = clear, arrows, letters in USSD text.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (mode === "call" && call?.stage === "incoming") callAct("answer");
        else if (mode === "home" || mode === "menu" || mode === "inbox" || mode === "ussd" || mode === "dial" || mode === "outcall") softLeft();
      } else if (e.key === "Escape") {
        e.preventDefault();
        red();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        softRight();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        nav(e.key === "ArrowUp" ? -1 : 1);
      } else if (mode === "ussd" && ussd && !ussd.end && e.key.length === 1 && /[\p{L} .,'-]/u.test(e.key)) {
        e.preventDefault();
        typeChar(e.key);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ---- Screen ----
  const t = new Date(now);
  const lvl = data?.subscriber?.level;
  let left = "";
  let right = "";
  let body: React.ReactNode = null;

  if (mode === "call" && call) {
    const secs = Math.floor((now - call.startedAt) / 1000);
    if (call.stage === "incoming") {
      const ringLeft = Math.max(0, OUTREACH.ringSec - secs);
      left = "Answer";
      right = "Reject";
      body = (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="lcd-blink text-[13px] font-bold">INCOMING CALL</div>
          <div className="mt-2 text-[15px] font-bold leading-tight">{call.insurer ? `${call.insurer}` : "StormShield"}</div>
          <div className="text-[12px]">Alerts</div>
          <div className="text-[11px]">+27 31 000 0911</div>
          <div className="mt-2 text-[10.5px]">{call.kind === "evacuate" ? "Evacuation call" : "Flood warning call"} · {call.attempt}/3</div>
          <div className="text-[10.5px]">rings {ringLeft}s</div>
        </div>
      );
    } else if (call.stage === "done") {
      left = "";
      right = "OK";
      body = (
        <div className="flex h-full flex-col items-center justify-center px-1 text-center">
          <div className="text-[13px] font-bold">CALL ENDED</div>
          <div className="mt-1 text-[11px] leading-snug">{call.goodbye}</div>
          {call.ticket && <div className="mt-1.5 border border-current px-1.5 text-[11px] font-bold">Ref {call.ticket}</div>}
        </div>
      );
    } else {
      right = "End";
      body = (
        <div className="text-[11.5px] leading-snug">
          <div className="flex justify-between font-bold"><span>StormShield</span><span>{mmss(secs)}</span></div>
          <div className="my-1 border-t border-current/40" />
          {call.stage === "menu" ? (
            <>
              <div className="text-[10.5px] italic">♪ {call.english ? "English message playing" : "Message playing"}…</div>
              <div className="mt-1 font-bold">Press a key:</div>
              {call.menu.map((m) => (
                <div key={m.key}>{m.key} {m.english}</div>
              ))}
            </>
          ) : (
            <>
              {call.effect && <div className="text-[10.5px]">✓ {call.effect}</div>}
              <div className="mt-1 font-bold">{call.question?.english}</div>
              {call.question?.options?.map((o) => <div key={o.key}>{o.key} {o.label}</div>)}
            </>
          )}
        </div>
      );
    }
  } else if (mode === "ussd" && ussd) {
    left = ussd.end ? "OK" : "Send";
    right = ussd.end ? "" : ussd.input ? "Clear" : "Cancel";
    body = ussd.busy && !ussd.screen ? (
      <div className="flex h-full flex-col items-center justify-center text-[12px]"><div className="lcd-blink">USSD code running…</div></div>
    ) : (
      <div className="flex h-full flex-col">
        <div className={`whitespace-pre-wrap text-[11.5px] leading-[1.32] ${ussd.busy ? "opacity-50" : ""}`}>{ussd.screen}</div>
        {!ussd.end && (
          <div className="mt-auto flex items-center border border-current/70 bg-white/20 px-1 text-[12px]">
            <span className="min-w-0 flex-1 truncate">{ussd.input}</span>
            <span className="lcd-caret">▌</span>
            {shift && <span className="ml-1 text-[9px] font-bold">abc</span>}
          </div>
        )}
      </div>
    );
  } else if (mode === "dial") {
    left = "Call";
    right = dial ? "Clear" : "Back";
    body = (
      <div className="flex h-full flex-col justify-end text-right">
        <div className="break-all text-[22px] font-bold leading-tight">{dial}</div>
        {dial === USSD_CODE && <div className="mt-1 text-left text-[10.5px]">StormShield USSD · free, no data needed</div>}
        {EMERGENCY.includes(dial) && <div className="mt-1 text-left text-[10.5px]">Emergency number</div>}
      </div>
    );
  } else if (mode === "outcall") {
    left = "OK";
    body = (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="lcd-blink text-[13px] font-bold">CALLING…</div>
        <div className="mt-1 text-[16px] font-bold">{dial}</div>
        <div className="mt-2 text-[10.5px] leading-snug">Demo phone: no real call is placed. In an emergency use a real phone and dial 112.</div>
      </div>
    );
  } else if (mode === "menu") {
    left = "Select";
    right = "Back";
    const items = [`StormShield ${USSD_CODE}`, `Messages${unread ? ` (${unread})` : ""}`, "Emergency 112"];
    body = (
      <div className="text-[12px]">
        <div className="mb-1 text-center font-bold">MENU</div>
        {items.map((it, i) => (
          <div key={it} className={`px-1 ${i === sel ? "bg-[#1d2a16] text-[#c9dcae]" : ""}`}>{it}</div>
        ))}
      </div>
    );
  } else if (mode === "inbox") {
    left = "Open";
    right = "Back";
    body = (
      <div className="text-[11.5px]">
        <div className="mb-0.5 font-bold">Inbox ({data?.inbox.length ?? 0})</div>
        {!data?.inbox.length && <div>No messages.</div>}
        {data?.inbox.map((m, i) => (
          <div key={m.id} className={`truncate px-0.5 ${i === sel ? "bg-[#1d2a16] text-[#c9dcae]" : ""}`} ref={(el) => { if (i === sel && el) el.scrollIntoView({ block: "nearest" }); }}>
            {hhmm(new Date(m.at))} {m.body.replace(/^StormShield:\s*/, "")}
          </div>
        ))}
      </div>
    );
  } else if (mode === "msg" && data?.inbox[msgIdx]) {
    const m = data.inbox[msgIdx];
    right = "Back";
    const [main, footer] = m.body.split("\n\nEMERGENCY:");
    body = (
      <div className="text-[11.5px] leading-snug">
        <div className="text-[10px]">From: StormShield · {hhmm(new Date(m.at))}</div>
        <div className="mt-1 whitespace-pre-wrap">{main}</div>
        {footer && <div className="mt-1.5 border-t border-dashed border-current/60 pt-1 font-bold">EMERGENCY:{footer}</div>}
      </div>
    );
  } else {
    left = "Menu";
    right = unread ? "Read" : "Msgs";
    body = (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="text-[34px] font-bold leading-none tracking-tight">{hhmm(t)}</div>
        <div className="text-[11px]">{now ? t.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }) : "\u00a0"}</div>
        {lvl && (lvl === "red" || lvl === "orange") && (
          <div className="mt-2 border border-current px-1.5 text-[10.5px] font-bold">{lvl === "red" ? "! FLOOD: EXTREME RISK" : "! FLOOD WARNING"}</div>
        )}
        {(flash || unread > 0) && <div className="lcd-blink mt-2 text-[11px] font-bold">✉ {unread || 1} new message{unread > 1 ? "s" : ""}</div>}
        <div className="mt-2 text-[10px] opacity-80">Dial {USSD_CODE}</div>
      </div>
    );
  }

  const bars = 4;
  return (
    <div className="select-none" aria-label="Feature phone simulator">
      <div className="relative mx-auto w-[264px] rounded-[38px] border border-black/60 bg-gradient-to-b from-[#2a333d] via-[#1b2129] to-[#12171d] p-4 pb-5 shadow-[0_30px_70px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,255,255,.12)]">
        <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-black/60 shadow-inner" />
        <div className="mb-2 text-center text-[9px] font-semibold uppercase tracking-[.3em] text-white/30">ZA·110</div>
        {/* LCD */}
        <div className={`lcd relative overflow-hidden rounded-md border-[3px] border-[#0b0f13] font-mono text-[#1d2a16] ${call?.stage === "incoming" ? "lcd-lit" : ""}`}>
          <div className="flex items-center justify-between px-1.5 pt-1 text-[10px] font-bold">
            <span className="flex items-end gap-[1.5px]" aria-label="Signal">
              {Array.from({ length: bars }).map((_, i) => <span key={i} className="w-[3px] bg-[#1d2a16]" style={{ height: 3 + i * 2.5 }} />)}
              <span className="ml-1">ZA-NET</span>
            </span>
            <span>{unread > 0 ? "✉ " : ""}{hhmm(t)}</span>
            <span className="flex items-center gap-0.5" aria-label="Battery">
              <span className="h-[7px] w-[16px] border border-[#1d2a16] p-[1px]"><span className="block h-full w-[70%] bg-[#1d2a16]" /></span>
            </span>
          </div>
          <div ref={scroll} className="lcd-scroll h-[214px] overflow-y-auto px-2 py-1">{body}</div>
          <div className="flex justify-between border-t border-[#1d2a16]/40 px-2 py-0.5 text-[11px] font-bold">
            <span>{left}</span>
            <span>{right}</span>
          </div>
        </div>
        {/* Controls */}
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="grid gap-1.5">
            <Key onClick={softLeft} label="Left soft key" className="h-7 rounded-l-xl rounded-r-md" />
            <Key onClick={green} label="Call / send" className="h-8 rounded-l-xl rounded-r-md !bg-gradient-to-b !from-[#1f8f4a] !to-[#126b33] text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
            </Key>
          </div>
          <div className="relative grid h-[72px] w-[72px] place-items-center rounded-full bg-gradient-to-b from-[#3a4552] to-[#222a33] shadow-[inset_0_1px_0_rgba(255,255,255,.15),0_2px_4px_rgba(0,0,0,.5)]">
            <button onClick={() => nav(-1)} aria-label="Up" className="absolute top-0.5 h-5 w-10 text-[10px] text-white/50 hover:text-white">▲</button>
            <button onClick={() => nav(1)} aria-label="Down" className="absolute bottom-0.5 h-5 w-10 text-[10px] text-white/50 hover:text-white">▼</button>
            <button onClick={softLeft} aria-label="OK" className="h-8 w-8 rounded-full bg-gradient-to-b from-[#4c5967] to-[#2b343e] text-[9px] font-bold text-white/70 active:scale-95">OK</button>
          </div>
          <div className="grid gap-1.5">
            <Key onClick={softRight} label="Right soft key" className="h-7 rounded-r-xl rounded-l-md" />
            <Key onClick={red} label="End / back" className="h-8 rounded-r-xl rounded-l-md !bg-gradient-to-b !from-[#c43333] !to-[#8f1e1e] text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ transform: "rotate(135deg)" }}><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
            </Key>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-x-2.5 gap-y-2">
          {KEYS.map(([k, sub]) => (
            <Key key={k} onClick={() => press(k)} label={`Key ${k}`} className="h-10 rounded-[14px]">
              <span className="text-[17px] font-semibold leading-none">{k}</span>
              <span className="ml-1 text-[8.5px] uppercase tracking-wider text-white/45">{sub}</span>
            </Key>
          ))}
        </div>
      </div>
    </div>
  );
}

function Key({ onClick, label, className = "", children }: { onClick: () => void; label: string; className?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex items-center justify-center bg-gradient-to-b from-[#3d4854] to-[#252d36] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_2px_3px_rgba(0,0,0,.5)] transition active:translate-y-[1px] active:brightness-125 ${className}`}
    >
      {children}
    </button>
  );
}
