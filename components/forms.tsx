"use client";
import { useMemo, useState } from "react";
import { Check, MapPin, MousePointerClick } from "lucide-react";
import { LANGS, alertText } from "@/lib/i18n";
import { VULNERABLE_OPTIONS, LEVEL_META, categoryOf } from "@/lib/risk";
import { COVER, INSURERS } from "@/lib/insurance";
import { Field } from "./ui";
import { zoneAt, type LatLng } from "@/lib/geo";
import { api } from "@/lib/client";
import type { Snapshot } from "@/lib/engine";
import { StormMap } from "./map";
import { AddressSearch } from "./panels";

export function LanguagePicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const preview = alertText(value || "en", "flood", "orange", "Umlazi");
  const english = alertText("en", "flood", "orange", "Umlazi");
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LANGS.map((l) => {
          const on = value === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => onChange(l.code)}
              aria-pressed={on}
              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${on ? "border-brand bg-brand/10 text-fg" : "border-line2 bg-black/20 text-fg/85 hover:border-dim"}`}
            >
              <span className="font-medium">{l.native}</span>
              {on && <Check size={15} className="text-brand" />}
            </button>
          );
        })}
      </div>
      {error && <div className="mt-1 text-xs text-danger">{error}</div>}
      {value && (
        <div className="mt-3 rounded-xl border border-warn/40 bg-warn/[.06] p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-warn">Preview · how your alerts will look</div>
          <div className="mt-1.5 text-sm font-semibold">{preview.title}</div>
          <div className="text-sm text-fg/90">{preview.body}</div>
          {value !== "en" && (
            <div className="mt-2 border-t border-white/10 pt-2 text-xs text-mute">
              <span className="font-semibold">English:</span> {english.body}
            </div>
          )}
          {value !== "en" && <div className="mt-2 text-[10px] text-dim">Draft translation, awaiting review by a native speaker.</div>}
        </div>
      )}
    </div>
  );
}

export function VulnerablePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const none = value.length === 0;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const Box = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} aria-pressed={on} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${on ? "border-violet bg-violet/10" : "border-line2 bg-black/20 hover:border-dim"}`}>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-violet bg-violet text-[#120a24]" : "border-line2"}`}>{on && <Check size={13} strokeWidth={3} />}</span>
      {label}
    </button>
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {VULNERABLE_OPTIONS.map((o) => (
        <Box key={o.id} on={value.includes(o.id)} label={o.label} onClick={() => toggle(o.id)} />
      ))}
      <Box on={none} label="None" onClick={() => onChange([])} />
    </div>
  );
}

export function passwordScore(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}

export function PasswordMeter({ value }: { value: string }) {
  const s = passwordScore(value);
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const colors = ["#ef4444", "#f97316", "#facc15", "#84cc16", "#22c55e"];
  if (!value) return null;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < s ? colors[s] : "rgba(255,255,255,.08)" }} />
        ))}
      </div>
      <span className="text-[11px] font-medium" style={{ color: colors[s] }}>
        {labels[s]}
      </span>
    </div>
  );
}

export interface PickedPlace {
  address: string;
  p: LatLng | null;
}

/** Address search + tap-on-map picker, with instant risk feedback for the chosen spot. */
export function LocationPicker({
  value,
  onChange,
  snap,
  error,
  label = "home",
  showMap = true,
}: {
  value: PickedPlace;
  onChange: (v: PickedPlace, gps?: boolean) => void;
  snap: Snapshot | null;
  error?: string;
  label?: string;
  showMap?: boolean;
}) {
  const [focusKey, setFocusKey] = useState(0);
  const zone = value.p ? zoneAt(value.p) : null;
  const zs = zone && snap ? snap.zones.find((z) => z.id === zone.id) : null;
  const focus = useMemo(() => (value.p ? { p: value.p, zoom: 14, key: focusKey } : null), [value.p, focusKey]);
  const fromMap = async (p: LatLng) => {
    onChange({ address: value.address || "Pinned location", p });
    try {
      const r = await api<{ label: string }>(`/api/geocode?lat=${p[0]}&lng=${p[1]}`);
      onChange({ address: r.label, p });
    } catch {
      /* keep pinned label */
    }
  };
  return (
    <div className="space-y-2">
      <AddressSearch
        initial={value.address}
        invalid={!!error}
        placeholder={`Search your ${label} address or suburb`}
        onPick={(r) => {
          onChange({ address: r.label, p: r.p }, r.gps);
          setFocusKey((k) => k + 1);
        }}
      />
      {error && <div className="text-xs text-danger">{error}</div>}
      {showMap && (
        <div className="relative h-56 overflow-hidden rounded-xl border border-line2">
          <StormMap snap={snap} layers={{ labels: false, gauges: false, storm: false, reports: false, hospital: false, evac: false, closures: false }} pick={value.p} onMapClick={fromMap} focus={focus} initialZoom={10} />
          <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5 rounded-lg bg-bg/90 px-2 py-1 text-[11px] text-mute">
            <MousePointerClick size={12} /> Tap the map to drop a pin
          </div>
        </div>
      )}
      {value.p && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-2 text-xs">
          <MapPin size={14} className="shrink-0 text-brand" />
          <span className="min-w-0 flex-1 truncate text-fg/85">{zone ? `In ${zone.name}` : "Outside the demo city (live mode covers it)"}</span>
          {zs && (
            <span className="shrink-0 font-semibold" style={{ color: LEVEL_META[zs.level].color }}>
              {categoryOf(zs.score)} now
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface InsuranceValue {
  insurerId: string;
  policyNo: string;
  cover: string[];
  vehicle: string;
  consent: boolean;
}
export const EMPTY_INSURANCE: InsuranceValue = { insurerId: "", policyNo: "", cover: [], vehicle: "", consent: true };

/** Optional insurance link (lets the insurer warn early and fast-track flood claims). */
export function InsuranceFields({ value, onChange, errors = {} }: { value: InsuranceValue; onChange: (v: InsuranceValue) => void; errors?: Record<string, string> }) {
  const set = (p: Partial<InsuranceValue>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[{ id: "", name: "Not insured / skip" }, ...INSURERS].map((i) => (
          <button key={i.id} type="button" onClick={() => set({ insurerId: i.id })} aria-pressed={value.insurerId === i.id} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${value.insurerId === i.id ? "border-brand bg-brand/10" : "border-line2 bg-black/20 hover:border-dim"}`}>
            {i.name}
            {"portal" in i && i.portal && <span className="ml-1 text-[10px] text-dim">(demo partner)</span>}
          </button>
        ))}
      </div>
      {errors.insurerId && <div className="text-xs text-danger">{errors.insurerId}</div>}
      {value.insurerId && (
        <div className="rise space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Policy number" error={errors.policyNo} required>
              <input className="input" value={value.policyNo} onChange={(e) => set({ policyNo: e.target.value })} placeholder="e.g. SSI-123456" />
            </Field>
            {value.cover.includes("vehicle") && (
              <Field label="Vehicle (optional)">
                <input className="input" value={value.vehicle} onChange={(e) => set({ vehicle: e.target.value })} placeholder="e.g. 2019 Toyota Corolla" />
              </Field>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-medium">What does the policy cover?</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(COVER) as (keyof typeof COVER)[]).map((c) => {
                const on = value.cover.includes(c);
                return (
                  <button key={c} type="button" onClick={() => set({ cover: on ? value.cover.filter((x) => x !== c) : [...value.cover, c] })} aria-pressed={on} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-brand bg-brand/15" : "border-line2"}`}>
                    {COVER[c]}
                  </button>
                );
              })}
            </div>
            {errors.cover && <div className="mt-1 text-xs text-danger">{errors.cover}</div>}
          </div>
          <label className="flex gap-2 text-sm text-fg/85">
            <input type="checkbox" checked={value.consent} onChange={(e) => set({ consent: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#3cc7f5]" />
            Share my alerts, call responses and flood risk for my addresses with my insurer, so they can warn me and process flood claims faster.
          </label>
        </div>
      )}
    </div>
  );
}
