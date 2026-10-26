"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Download, Loader2, Save, Trash2 } from "lucide-react";
import { Field, Modal, PanelHead } from "@/components/ui";
import { EMPTY_INSURANCE, InsuranceFields, LanguagePicker, LocationPicker, VulnerablePicker, type InsuranceValue, type PickedPlace } from "@/components/forms";
import { ApiError, api, notifySession } from "@/lib/client";
import { usePoll } from "@/hooks/usePoll";
import type { StatusResponse } from "@/lib/types";
import type { PublicUser } from "@/lib/users";

export default function Profile() {
  const router = useRouter();
  const { data: st } = usePoll<StatusResponse>("/api/status", 60000);
  const [u, setU] = useState<PublicUser | null>(null);
  const [f, setF] = useState({ firstName: "", surname: "", phone: "", language: "en", emergencyName: "", emergencyPhone: "", medical: "" });
  const [home, setHome] = useState<PickedPlace>({ address: "", p: null });
  const [work, setWork] = useState<PickedPlace>({ address: "", p: null });
  const [vul, setVul] = useState<string[]>([]);
  const [ins, setIns] = useState<InsuranceValue>(EMPTY_INSURANCE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: PublicUser }>("/api/profile")
      .then(({ user }) => {
        setU(user);
        setF({ firstName: user.firstName, surname: user.surname, phone: user.phone, language: user.language, emergencyName: user.emergencyName, emergencyPhone: user.emergencyPhone, medical: user.medical ?? "" });
        setHome({ address: user.homeAddress, p: user.home });
        setWork({ address: user.workAddress ?? "", p: user.work });
        setVul(user.vulnerable);
        setIns({ insurerId: user.insurerId ?? "", policyNo: user.policyNo ?? "", cover: user.cover, vehicle: user.vehicle ?? "", consent: user.insurerConsent });
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setErrors({});
    setSaved(false);
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: { ...f, homeAddress: home.address, homeLat: home.p?.[0], homeLng: home.p?.[1], workAddress: work.p ? work.address : "", workLat: work.p?.[0], workLng: work.p?.[1], vulnerable: vul,
          insurerId: ins.insurerId, policyNo: ins.policyNo, cover: ins.cover, vehicle: ins.vehicle, insurerConsent: ins.consent },
      });
      setSaved(true);
      notifySession();
    } catch (e) {
      setErrors((e as ApiError).errors ?? {});
    } finally {
      setBusy(false);
    }
  };

  const exportData = () => {
    if (!u) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: u }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stormshield-my-data.json";
    a.click();
  };

  const remove = async () => {
    setDelErr(null);
    try {
      await api("/api/profile", { method: "DELETE", body: { password: pw } });
      notifySession();
      router.push("/");
    } catch (e) {
      setDelErr((e as Error).message);
    }
  };

  if (!u) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-mute">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile & settings</h1>
        <p className="text-sm text-mute">{u.email}</p>
      </div>
      <div className="panel space-y-4 p-5">
        <PanelHead title="Personal details" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" error={errors.firstName}>
            <input className="input" value={f.firstName} onChange={set("firstName")} />
          </Field>
          <Field label="Surname" error={errors.surname}>
            <input className="input" value={f.surname} onChange={set("surname")} />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <input className="input" value={f.phone} onChange={set("phone")} />
          </Field>
        </div>
      </div>
      <div className="panel space-y-4 p-5">
        <PanelHead title="Locations" sub="Alerts are sent for these places" />
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Home</div>
          <LocationPicker value={home} onChange={setHome} snap={st?.snap ?? null} error={errors.homeAddress} />
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Work (optional)</div>
          <LocationPicker value={work} onChange={setWork} snap={st?.snap ?? null} error={errors.workAddress} label="work" showMap={false} />
          {work.address && (
            <button className="mt-1 text-xs text-mute hover:text-fg" onClick={() => setWork({ address: "", p: null })}>
              Clear work address
            </button>
          )}
        </div>
      </div>
      <div className="panel space-y-4 p-5">
        <PanelHead title="Safety profile" />
        <LanguagePicker value={f.language} onChange={(v) => setF((s) => ({ ...s, language: v }))} error={errors.language} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Emergency contact name" error={errors.emergencyName}>
            <input className="input" value={f.emergencyName} onChange={set("emergencyName")} />
          </Field>
          <Field label="Emergency contact number" error={errors.emergencyPhone}>
            <input className="input" value={f.emergencyPhone} onChange={set("emergencyPhone")} />
          </Field>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Vulnerable person status</div>
          <VulnerablePicker value={vul} onChange={setVul} />
        </div>
        <Field label="Medical conditions (optional)">
          <textarea className="input min-h-[64px]" value={f.medical} onChange={set("medical")} maxLength={300} />
        </Field>
      </div>
      <div className="panel space-y-4 p-5" id="insurance">
        <PanelHead title="Insurance" sub="Optional. Lets your insurer warn you early and fast-track flood claims." />
        <InsuranceFields value={ins} onChange={setIns} errors={errors} />
      </div>
      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-2xl border border-line2 bg-bg/95 p-3 shadow-2xl backdrop-blur">
        {saved && (
          <span className="flex items-center gap-1 text-sm text-safe">
            <Check size={16} /> Saved
          </span>
        )}
        {Object.keys(errors).length > 0 && <span className="text-sm text-danger">Please fix the highlighted fields.</span>}
        <span className="flex-1" />
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save changes
        </button>
      </div>
      <div className="panel p-5">
        <PanelHead title="Your data (POPIA)" />
        <p className="text-sm text-mute">Download everything StormShield stores about you, or delete your account and all personal data permanently.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={exportData}>
            <Download size={16} /> Download my data
          </button>
          <button className="btn btn-ghost !border-danger/40 text-red-300" onClick={() => setDel(true)}>
            <Trash2 size={16} /> Delete my account
          </button>
        </div>
      </div>
      <Modal open={del} onClose={() => setDel(false)} title="Delete your account?" tone="danger">
        <p className="text-sm text-mute">This removes your profile, locations, family circle, check-ins and help requests. You will stop receiving alerts. This cannot be undone.</p>
        <Field label="Confirm with your password">
          <input className="input mt-1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {delErr && <div className="mt-2 text-sm text-danger">{delErr}</div>}
        <button className="btn btn-danger mt-4 w-full" onClick={remove} disabled={!pw}>
          <Trash2 size={16} /> Permanently delete
        </button>
      </Modal>
    </main>
  );
}
