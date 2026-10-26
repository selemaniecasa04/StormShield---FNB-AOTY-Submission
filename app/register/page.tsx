"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Crosshair, Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Field } from "@/components/ui";
import { EMPTY_INSURANCE, InsuranceFields, LanguagePicker, LocationPicker, PasswordMeter, VulnerablePicker, type InsuranceValue, type PickedPlace } from "@/components/forms";
import { COVER, insurerName } from "@/lib/insurance";
import AuthAside from "@/components/AuthAside";
import { ApiError, api, getPosition, notifySession } from "@/lib/client";
import { usePoll } from "@/hooks/usePoll";
import type { StatusResponse } from "@/lib/types";
import { langName } from "@/lib/i18n";
import { VULNERABLE_OPTIONS } from "@/lib/risk";

const STEPS = ["Your details", "Your locations", "Safety profile", "Review"];
const FIELD_STEP: Record<string, number> = {
  firstName: 0, surname: 0, phone: 0, email: 0, password: 0, confirmPassword: 0,
  homeAddress: 1, workAddress: 1, language: 2, emergencyName: 2, emergencyPhone: 2, insurerId: 2, policyNo: 2, cover: 2, consent: 3,
};

export default function RegisterPage() {
  const router = useRouter();
  const { data } = usePoll<StatusResponse>("/api/status", 60000);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ firstName: "", surname: "", phone: "", email: "", password: "", confirmPassword: "", language: "", emergencyName: "", emergencyPhone: "", medical: "" });
  const [home, setHome] = useState<PickedPlace>({ address: "", p: null });
  const [work, setWork] = useState<PickedPlace>({ address: "", p: null });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [vul, setVul] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [ins, setIns] = useState<InsuranceValue>(EMPTY_INSURANCE);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF((s) => ({ ...s, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: "" }));
  };

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!f.firstName.trim()) e.firstName = "Required";
      if (!f.surname.trim()) e.surname = "Required";
      if (!/^(\+?27|0)\d{9}$/.test(f.phone.replace(/[\s()-]/g, ""))) e.phone = "Enter a South African number, e.g. 082 123 4567";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Enter a valid email";
      if (f.password.length < 8 || !/\d/.test(f.password) || !/[A-Za-z]/.test(f.password)) e.password = "At least 8 characters with letters and numbers";
      if (f.password !== f.confirmPassword) e.confirmPassword = "Passwords don't match";
    }
    if (s === 1) {
      if (!home.p) e.homeAddress = "Search your address or tap the map to set your home";
      if (work.address && !work.p) e.workAddress = "Choose a result or clear this field";
    }
    if (s === 2) {
      if (!f.language) e.language = "Choose your language";
      if (!f.emergencyName.trim()) e.emergencyName = "Required";
      if (!/^(\+?27|0)\d{9}$/.test(f.emergencyPhone.replace(/[\s()-]/g, ""))) e.emergencyPhone = "Enter a valid number";
      if (ins.insurerId && !ins.policyNo.trim()) e.policyNo = "Enter your policy number";
      if (ins.insurerId && !ins.cover.length) e.cover = "Choose what your policy covers";
    }
    if (s === 3 && !consent) e.consent = "Please accept to continue";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => validate(step) && setStep((s) => Math.min(3, s + 1));

  const useGps = async () => {
    setGpsState("busy");
    try {
      const p = await getPosition();
      setGps({ lat: p.lat, lng: p.lng });
      setGpsState("ok");
      if (!home.p) {
        let label = "My location";
        try {
          label = (await api<{ label: string }>(`/api/geocode?lat=${p.lat}&lng=${p.lng}`)).label;
        } catch {
          /* ignore */
        }
        setHome({ address: label, p: [p.lat, p.lng] });
      }
    } catch {
      setGpsState("err");
    }
  };

  const submit = async () => {
    if (!validate(3)) return;
    setBusy(true);
    setFormError(null);
    try {
      const r = await api<{ redirect: string }>("/api/auth/register", {
        body: {
          ...f,
          homeAddress: home.address,
          homeLat: home.p?.[0],
          homeLng: home.p?.[1],
          workAddress: work.p ? work.address : "",
          workLat: work.p?.[0],
          workLng: work.p?.[1],
          gpsLat: gps?.lat,
          gpsLng: gps?.lng,
          vulnerable: vul,
          consent,
          insurerId: ins.insurerId,
          policyNo: ins.policyNo,
          cover: ins.cover,
          vehicle: ins.vehicle,
          insurerConsent: ins.consent,
        },
      });
      notifySession();
      router.push(r.redirect);
    } catch (e) {
      const err = e as ApiError;
      setFormError(err.message);
      if (err.errors && Object.keys(err.errors).length) {
        setErrors(err.errors);
        const first = Math.min(...Object.keys(err.errors).map((k) => FIELD_STEP[k] ?? 3));
        setStep(first);
      }
      setBusy(false);
    }
  };

  const snap = data?.snap ?? null;

  return (
    <main className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <AuthAside />
      <section className="flex justify-center p-4 sm:p-8">
        <div className="w-full max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight">Create your StormShield account</h1>
          <p className="mt-1 text-sm text-mute">Takes about 2 minutes. We only use your details to keep you and your family safe.</p>

          <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button type="button" onClick={() => i < step && setStep(i)} className="w-full text-left" disabled={i >= step} aria-current={i === step ? "step" : undefined}>
                  <div className={`h-1 rounded-full transition-all ${i < step ? "bg-brand" : i === step ? "bg-brand/70" : "bg-white/10"}`} />
                  <div className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${i <= step ? "text-fg" : "text-dim"}`}>
                    {i < step ? <Check size={12} className="text-brand" /> : <span className="font-mono">{i + 1}</span>}
                    <span className="truncate">{s}</span>
                  </div>
                </button>
              </li>
            ))}
          </ol>

          <div className="panel rise mt-5 p-5 sm:p-6" key={step}>
            {step === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" error={errors.firstName} required>
                  <input className="input" value={f.firstName} onChange={set("firstName")} autoComplete="given-name" aria-invalid={!!errors.firstName} />
                </Field>
                <Field label="Surname" error={errors.surname} required>
                  <input className="input" value={f.surname} onChange={set("surname")} autoComplete="family-name" aria-invalid={!!errors.surname} />
                </Field>
                <Field label="Phone number" error={errors.phone} hint="Alerts arrive by SMS even without data" required>
                  <input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="082 123 4567" aria-invalid={!!errors.phone} />
                </Field>
                <Field label="Email address" error={errors.email} required>
                  <input className="input" type="email" value={f.email} onChange={set("email")} autoComplete="email" aria-invalid={!!errors.email} />
                </Field>
                <Field label="Password" error={errors.password} required>
                  <div className="relative">
                    <input className="input !pr-10" type={show ? "text" : "password"} value={f.password} onChange={set("password")} autoComplete="new-password" aria-invalid={!!errors.password} />
                    <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-dim hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
                      {show ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <PasswordMeter value={f.password} />
                </Field>
                <Field label="Confirm password" error={errors.confirmPassword} required>
                  <input className="input" type={show ? "text" : "password"} value={f.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password" aria-invalid={!!errors.confirmPassword} />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <div className="mb-1.5 text-[13px] font-medium">
                    Home address <span className="text-danger">*</span>
                  </div>
                  <LocationPicker value={home} onChange={setHome} snap={snap} error={errors.homeAddress} />
                </div>
                <div>
                  <div className="mb-1.5 text-[13px] font-medium">
                    Work address <span className="text-dim">(optional)</span>
                  </div>
                  <LocationPicker value={work} onChange={setWork} snap={snap} error={errors.workAddress} label="work" showMap={false} />
                  {work.address && (
                    <button type="button" className="mt-1 text-xs text-mute hover:text-fg" onClick={() => setWork({ address: "", p: null })}>
                      Clear work address
                    </button>
                  )}
                </div>
                <div className="rounded-xl border border-line bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">GPS location</div>
                      <div className="text-xs text-mute">Share where you are now, so alerts follow you when you&apos;re away from home.</div>
                    </div>
                    <button type="button" onClick={useGps} className="btn btn-ghost shrink-0 !py-2 text-sm">
                      {gpsState === "busy" ? <Loader2 size={16} className="animate-spin" /> : gpsState === "ok" ? <Check size={16} className="text-safe" /> : <Crosshair size={16} />}
                      {gpsState === "ok" ? "Shared" : "Share GPS"}
                    </button>
                  </div>
                  {gpsState === "ok" && gps && <div className="mt-2 font-mono text-xs text-safe">{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</div>}
                  {gpsState === "err" && <div className="mt-2 text-xs text-warn">Couldn&apos;t get your location. You can skip this.</div>}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <div className="mb-1.5 text-[13px] font-medium">
                    Preferred language <span className="text-danger">*</span>
                  </div>
                  <LanguagePicker value={f.language} onChange={(v) => { setF((s) => ({ ...s, language: v })); setErrors((x) => ({ ...x, language: "" })); }} error={errors.language} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Emergency contact name" error={errors.emergencyName} required>
                    <input className="input" value={f.emergencyName} onChange={set("emergencyName")} aria-invalid={!!errors.emergencyName} />
                  </Field>
                  <Field label="Emergency contact number" error={errors.emergencyPhone} hint="They get an SMS if you call for help" required>
                    <input className="input" value={f.emergencyPhone} onChange={set("emergencyPhone")} inputMode="tel" placeholder="083 765 4321" aria-invalid={!!errors.emergencyPhone} />
                  </Field>
                </div>
                <div>
                  <div className="mb-1.5 text-[13px] font-medium">Is anyone in your household vulnerable?</div>
                  <VulnerablePicker value={vul} onChange={setVul} />
                  <p className="mt-1.5 text-xs text-dim">Responders see this so they can bring the right help first.</p>
                </div>
                <Field label="Medical conditions (optional)" hint="e.g. needs insulin, oxygen or dialysis. Only shared with responders.">
                  <textarea className="input min-h-[72px]" value={f.medical} onChange={set("medical")} maxLength={300} />
                </Field>
                <div>
                  <div className="mb-1.5 text-[13px] font-medium">
                    Home or car insurance <span className="text-dim">(optional)</span>
                  </div>
                  <InsuranceFields value={ins} onChange={setIns} errors={errors} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <Summary
                  rows={[
                    ["Name", `${f.firstName} ${f.surname}`],
                    ["Phone", f.phone],
                    ["Email", f.email],
                    ["Home", home.address],
                    ["Work", work.p ? work.address : "Not set"],
                    ["GPS", gps ? "Shared" : "Not shared"],
                    ["Language", `${langName(f.language)}${f.language !== "en" ? " + English" : ""}`],
                    ["Emergency contact", `${f.emergencyName} · ${f.emergencyPhone}`],
                    ["Vulnerable", vul.length ? vul.map((v) => VULNERABLE_OPTIONS.find((o) => o.id === v)?.label).join(", ") : "None"],
                    ["Medical", f.medical || "None given"],
                    ["Insurance", ins.insurerId ? `${insurerName(ins.insurerId)} · ${ins.policyNo} · ${ins.cover.map((c) => COVER[c as keyof typeof COVER]).join(", ")}${ins.consent ? " · sharing on" : ""}` : "Not linked"],
                  ]}
                  onEdit={setStep}
                />
                <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${errors.consent ? "border-danger" : "border-line2"}`}>
                  <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => ({ ...x, consent: "" })); }} className="mt-0.5 h-4 w-4 accent-[#3cc7f5]" />
                  <span className="text-fg/85">
                    I agree that StormShield may use my locations, contact details and safety information to send me alerts and to share them with emergency responders during an event, in line with POPIA. I can delete my account at any time.
                  </span>
                </label>
                {errors.consent && <div className="-mt-2 text-xs text-danger">{errors.consent}</div>}
                <div className="flex items-start gap-2 text-xs text-dim">
                  <Lock size={13} className="mt-0.5 shrink-0" /> Passwords are hashed with bcrypt. Medical details are only shown to verified responders.
                </div>
              </div>
            )}

            {formError && <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-red-200">{formError}</div>}

            <div className="mt-6 flex items-center gap-2">
              {step > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              <div className="flex-1" />
              {step < 3 ? (
                <button type="button" className="btn btn-primary" onClick={next}>
                  Continue <ArrowRight size={16} />
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Create account
                </button>
              )}
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-mute">
            Already registered?{" "}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function Summary({ rows, onEdit }: { rows: [string, string][]; onEdit: (s: number) => void }) {
  const stepOf = (k: string) => (["Name", "Phone", "Email"].includes(k) ? 0 : ["Home", "Work", "GPS"].includes(k) ? 1 : 2);
  return (
    <dl className="divide-y divide-line rounded-xl border border-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start gap-3 px-3 py-2 text-sm">
          <dt className="w-36 shrink-0 text-mute">{k}</dt>
          <dd className="min-w-0 flex-1 break-words">{v}</dd>
          <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => onEdit(stepOf(k))}>
            Edit
          </button>
        </div>
      ))}
    </dl>
  );
}
