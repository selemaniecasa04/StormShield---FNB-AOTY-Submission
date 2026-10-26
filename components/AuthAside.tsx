"use client";
import { BellRing, HeartHandshake, Languages, Radar } from "lucide-react";
import { Logo } from "./ui";

const POINTS = [
  { icon: Radar, title: "Predicts the flood path", text: "Rain, river levels and soil saturation are combined into a 12-hour risk forecast for every area." },
  { icon: BellRing, title: "Warns the right people", text: "Your home and work addresses decide which alerts reach you, by push, SMS and voice call." },
  { icon: Languages, title: "Speaks your language", text: "Alerts in all 11 official languages, with English underneath." },
  { icon: HeartHandshake, title: "Brings help to you", text: "One tap tells responders where you are and who in your home is vulnerable." },
];

export default function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden border-r border-line bg-panel lg:block">
      <div className="absolute inset-0 grid-bg" />
      <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <radialGradient id="aa" cx="0.3" cy="0.75" r="0.6">
            <stop offset="0" stopColor="#ef4444" stopOpacity=".35" />
            <stop offset=".5" stopColor="#f97316" stopOpacity=".12" />
            <stop offset="1" stopColor="#070b10" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="600" height="800" fill="url(#aa)" />
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx="180" cy="600" r={80 + i * 90} fill="none" stroke="#3cc7f5" strokeOpacity={0.18 - i * 0.035} strokeDasharray="3 8" />
        ))}
        <path d="M-20 520 C 80 500, 140 560, 220 590 S 380 640, 620 600" stroke="#38bdf8" strokeWidth="18" strokeOpacity=".18" fill="none" />
        <path d="M-20 520 C 80 500, 140 560, 220 590 S 380 640, 620 600" stroke="#7dd3fc" strokeWidth="2" className="flow-path" fill="none" />
        <path d="M60 700 L 160 620 L 300 640 L 420 560" stroke="#4ade80" strokeWidth="3" className="evac-path" fill="none" />
      </svg>
      <div className="relative flex h-full flex-col p-10">
        <div className="flex items-center gap-2.5 text-xl font-semibold">
          <Logo size={34} /> Storm<span className="-ml-2.5 text-brand">Shield</span>
        </div>
        <h2 className="mt-12 max-w-md text-[34px] font-semibold leading-[1.1] tracking-tight">
          When the river rises, <span className="text-brand">every minute of warning counts.</span>
        </h2>
        <div className="mt-10 grid max-w-md gap-5">
          {POINTS.map((p) => (
            <div key={p.title} className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line2 bg-bg/60 text-brand">
                <p.icon size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold">{p.title}</div>
                <div className="text-sm text-mute">{p.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto text-xs text-dim">Built for municipalities, disaster management centres and the communities they protect.</div>
      </div>
    </aside>
  );
}
