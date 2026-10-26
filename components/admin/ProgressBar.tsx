"use client";

export interface OutreachStats { total: number; queued: number; ringing: number; reached: number; unreached: number; safe: number; preparing: number; help: number }

export default function ProgressBar({ s }: { s: OutreachStats }) {
  const seg = [
    { n: s.safe, c: "#22c55e", l: "Safe" },
    { n: s.preparing, c: "#facc15", l: "Preparing" },
    { n: s.help, c: "#ef4444", l: "Need help" },
    { n: Math.max(0, s.reached - s.safe - s.preparing - s.help), c: "#3cc7f5", l: "Other response" },
    { n: s.ringing, c: "#a78bfa", l: "Ringing" },
    { n: s.queued, c: "#475569", l: "Queued / retry" },
    { n: s.unreached, c: "#f97316", l: "Unreached" },
  ];
  const total = Math.max(1, s.total);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[.06]">
        {seg.map((x) => x.n > 0 && <div key={x.l} style={{ width: `${(x.n / total) * 100}%`, background: x.c }} title={`${x.l}: ${x.n}`} />)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-mute">
        {seg.filter((x) => x.n > 0).map((x) => (
          <span key={x.l} className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: x.c }} />{x.l} {x.n}</span>
        ))}
      </div>
    </div>
  );
}

