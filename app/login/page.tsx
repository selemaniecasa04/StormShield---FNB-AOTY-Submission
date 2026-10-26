"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, LogIn, ShieldAlert, Smartphone, Umbrella, UserRound } from "lucide-react";
import { Field, Logo } from "@/components/ui";
import { ApiError, api, notifySession } from "@/lib/client";
import AuthAside from "@/components/AuthAside";

const DEMOS = [
  { key: "selemani", name: "Selemani Ecasa", sub: "Admin · Disaster management · username selemani", icon: ShieldAlert, tone: "admin" },
  { key: "ayanda", name: "Ayanda Sibanda", sub: "Admin · Disaster management · username ayanda", icon: ShieldAlert, tone: "admin" },
  { key: "insurer", name: "Naledi Khumalo", sub: "Insurer · ShieldSure claims (demo insurer)", icon: Umbrella, tone: "insurer" },
  { key: "thandi", name: "Thandi Mkhize", sub: "Resident · Umlazi · isiZulu · insured", icon: UserRound, tone: "user" },
  { key: "pieter", name: "Pieter van der Merwe", sub: "Resident · Amanzimtoti · Afrikaans · elderly", icon: UserRound, tone: "user" },
];

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (payload: Record<string, string>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const r = await api<{ redirect: string }>("/api/auth/login", { body: payload });
      notifySession();
      router.push(r.redirect);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not sign in.");
      setBusy(null);
    }
  };

  return (
    <main className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-2">
      <AuthAside />
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Logo size={34} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-mute">Sign in with your email or phone number.</p>
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              go({ identifier, password }, "form");
            }}
          >
            <Field label="Email, phone number or username">
              <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" placeholder="you@example.com, 082 123 4567 or selemani" required />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input className="input !pr-10" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-dim hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
            <button className="btn btn-primary w-full !py-2.5" disabled={!!busy}>
              {busy === "form" ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />} Sign in
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-mute">
            New to StormShield?{" "}
            <Link href="/register" className="font-semibold text-brand hover:underline">
              Create an account
            </Link>
          </p>

          <div className="mt-8 rounded-2xl border border-line bg-panel p-4">
            <div className="label">Try a demo account</div>
            <p className="mt-1 text-xs text-dim">
              One tap, no password needed. Staff can also type their username (e.g. <span className="font-mono text-mute">selemani</span>) with password <span className="font-mono text-mute">1234</span>. Residents use <span className="font-mono text-mute">Demo@2026</span>.
            </p>
            <div className="mt-3 space-y-2">
              {DEMOS.map((d) => (
                <button key={d.key} onClick={() => go({ demo: d.key }, d.key)} disabled={!!busy} className="flex w-full items-center gap-3 rounded-xl border border-line2 bg-black/20 px-3 py-2.5 text-left transition hover:border-brand/50 hover:bg-brand/5">
                  <span className={`grid h-9 w-9 place-items-center rounded-full ${d.tone === "admin" ? "bg-violet/15 text-violet" : d.tone === "insurer" ? "bg-watch/15 text-watch" : "bg-brand/15 text-brand"}`}>
                    {busy === d.key ? <Loader2 size={16} className="animate-spin" /> : <d.icon size={17} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{d.name}</span>
                    <span className="block truncate text-xs text-mute">{d.sub}</span>
                  </span>
                  <span className="text-xs font-semibold text-brand">Enter →</span>
                </button>
              ))}
              <Link href="/phone" className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line2 px-3 py-2.5 text-left transition hover:border-brand/50 hover:bg-brand/5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-safe/15 text-safe"><Smartphone size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Gogo Nomvula · basic phone</span>
                  <span className="block truncate text-xs text-mute">No app or data: USSD *120*7867#, SMS and voice calls</span>
                </span>
                <span className="text-xs font-semibold text-brand">Open phone →</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
