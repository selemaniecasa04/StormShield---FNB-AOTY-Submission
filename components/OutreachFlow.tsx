"use client";
import { ArrowRight, BellRing, MessageSquareText, PhoneCall, PhoneMissed, ShieldAlert, Users } from "lucide-react";
import { KEY_INFO, OUTREACH, type Key } from "@/lib/outreach-text";

const STEPS = [
  { icon: BellRing, title: "Trigger", text: "Area turns red (everyone) or orange (vulnerable people). Staff or an insurer can also launch calls." },
  { icon: MessageSquareText, title: "SMS + call 1", text: "Warning SMS in their language, then an automated call." },
  { icon: PhoneMissed, title: "No answer? Call 2", text: `SMS reminder, then call again after ${OUTREACH.production.gapsMin[0]} min.` },
  { icon: PhoneCall, title: "Call 3", text: `Final attempt after another ${OUTREACH.production.gapsMin[1]} min.` },
  { icon: Users, title: "Escalate", text: "Emergency contact and family get an SMS and call. Person joins the Unreached queue; vulnerable people get an automatic welfare check." },
];

export default function OutreachFlow({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <ol className={`grid gap-2 ${compact ? "" : "sm:grid-cols-5"}`}>
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative rounded-xl border border-line bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
                <s.icon size={15} />
              </span>
              <span className="text-sm font-semibold">{s.title}</span>
              {!compact && i < STEPS.length - 1 && <ArrowRight size={14} className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 text-dim sm:block" />}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-mute">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-3 rounded-xl border border-line bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">
          <ShieldAlert size={12} /> Keypad options on the call
        </div>
        <div className={`grid gap-1.5 ${compact ? "" : "sm:grid-cols-5"}`}>
          {(Object.keys(KEY_INFO) as Key[]).map((k) => (
            <div key={k} className="flex items-start gap-2 text-xs">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono font-bold" style={{ background: `${KEY_INFO[k].color}22`, color: KEY_INFO[k].color }}>
                {k}
              </span>
              <span className="text-fg/85">{KEY_INFO[k].effect}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-dim">
        Demo timing is compressed: each call rings for {OUTREACH.ringSec} s and retries come after {OUTREACH.gapsSec[0]} s and {OUTREACH.gapsSec[1]} s. Calls are simulated in the app; production would use a voice provider (e.g. Africa&apos;s Talking) with recorded prompts in each language.
      </p>
    </div>
  );
}
