"use client";
import { use, useEffect, useState } from "react";
import { Accessibility, CheckCircle2, Footprints, HandHelping, Loader2 } from "lucide-react";
import { Logo } from "@/components/ui";
import { api } from "@/lib/client";
import { CHECK_META, type CheckStatus } from "@/lib/risk";

const BTNS: { s: CheckStatus; icon: React.ComponentType<{ size?: number }> }[] = [
  { s: "safe", icon: CheckCircle2 },
  { s: "evacuating", icon: Footprints },
  { s: "need_help", icon: HandHelping },
  { s: "vulnerable_present", icon: Accessibility },
];

/** One-tap check-in for family members without an account (opened from an SMS link). */
export default function FamilyCheckIn({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<{ name: string; inviter: string; status: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<CheckStatus | null>(null);
  const [done, setDone] = useState<CheckStatus | null>(null);

  useEffect(() => {
    api<{ name: string; inviter: string; status: string | null }>(`/api/c/${token}`)
      .then(setInfo)
      .catch((e) => setErr(e.message));
  }, [token]);

  const send = async (s: CheckStatus) => {
    setBusy(s);
    try {
      await api(`/api/c/${token}`, { body: { status: s } });
      setDone(s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="grid-bg flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold">
          <Logo size={30} /> Storm<span className="-ml-2 text-brand">Shield</span>
        </div>
        <div className="panel p-6">
          {err ? (
            <p className="text-center text-sm text-danger">{err}</p>
          ) : !info ? (
            <div className="grid place-items-center py-8 text-mute">
              <Loader2 className="animate-spin" />
            </div>
          ) : done ? (
            <div className="rise text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: `${CHECK_META[done].color}22`, color: CHECK_META[done].color }}>
                <CheckCircle2 size={34} />
              </div>
              <h1 className="mt-4 text-xl font-semibold">Thank you, {info.name}</h1>
              <p className="mt-1 text-sm text-mute">{info.inviter} can now see: “{CHECK_META[done].label}”.</p>
              {done === "need_help" && (
                <a href="tel:112" className="btn btn-danger mt-5 w-full">
                  Call 112 now
                </a>
              )}
            </div>
          ) : (
            <>
              <h1 className="text-center text-xl font-semibold">Hi {info.name}, are you safe?</h1>
              <p className="mt-1 text-center text-sm text-mute">{info.inviter} is checking on you during the flood. Tap one button. No app or account needed.</p>
              <div className="mt-5 grid gap-2">
                {BTNS.map(({ s, icon: Icon }) => (
                  <button key={s} onClick={() => send(s)} disabled={!!busy} className="flex items-center gap-3 rounded-xl border p-4 text-left text-base font-semibold transition hover:brightness-125" style={{ borderColor: `${CHECK_META[s].color}66`, background: `${CHECK_META[s].color}14` }}>
                    <span style={{ color: CHECK_META[s].color }}>{busy === s ? <Loader2 size={24} className="animate-spin" /> : <Icon size={24} />}</span>
                    {s === "safe" ? "I am safe" : s === "need_help" ? "I need help" : CHECK_META[s].label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-dim">In an emergency call 112 or 10177.</p>
      </div>
    </main>
  );
}
