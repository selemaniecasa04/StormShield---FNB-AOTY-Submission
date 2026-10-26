"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Briefcase, Crosshair, Home as HomeIcon, LayoutGrid, Loader2, MessageSquareText, RefreshCw, Tent, Umbrella, UsersRound } from "lucide-react";
import RiskCard from "@/components/RiskCard";
import PanicButton from "@/components/dashboard/PanicButton";
import CheckIn from "@/components/dashboard/CheckIn";
import Impact from "@/components/dashboard/Impact";
import Family from "@/components/dashboard/Family";
import Insurance from "@/components/dashboard/Insurance";
import { CallHistory, HelpStatus, MissedCallsBanner } from "@/components/dashboard/Status";
import { AlertsFeed, MessageLog, MiniMap, ReportHazard, ShelterLocator } from "@/components/dashboard/Panels";
import { EventBanner, WeatherCard } from "@/components/panels";
import PhoneCall from "@/components/PhoneCall";
import { ToastStack, useToasts } from "@/components/Toasts";
import { usePoll } from "@/hooks/usePoll";
import { api, getPosition } from "@/lib/client";
import type { MeResponse, StatusResponse } from "@/lib/types";
import { LEVEL_META, rank } from "@/lib/risk";
import { timeAgo } from "@/lib/format";

const GREET: Record<string, string> = { zu: "Sawubona", xh: "Molo", af: "Goeie dag", st: "Dumela", tn: "Dumela", nso: "Thobela", ts: "Avuxeni", ve: "Ndaa", ss: "Sawubona", nr: "Lotjhani", en: "Hello" };
const PLACE_ICON = { home: HomeIcon, work: Briefcase, gps: Crosshair } as const;
type Tab = "overview" | "family" | "help" | "insurance" | "messages";

export default function Dashboard() {
  const router = useRouter();
  const me = usePoll<MeResponse>("/api/me", 4000);
  const st = usePoll<StatusResponse>("/api/status", 15000);
  const [placeKey, setPlaceKey] = useState("home");
  const [sharing, setSharing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [updated, setUpdated] = useState<string>(new Date().toISOString());
  const { toasts, push, dismiss } = useToasts();
  const seenMsg = useRef<number | null>(null);

  useEffect(() => {
    if (me.error && "status" in me.error && (me.error as { status: number }).status === 401) router.replace("/login");
  }, [me.error, router]);
  useEffect(() => {
    const role = me.data?.user.role;
    if (role === "admin") router.replace("/admin");
    if (role === "insurer") router.replace("/insurer");
  }, [me.data, router]);

  // Pop-up notifications for anything new sent to this resident (dispatch, claim updates, alerts…).
  useEffect(() => {
    const d = me.data;
    if (!d) return;
    setUpdated(new Date().toISOString());
    const mine = d.messages.filter((m) => m.to_phone === d.user.phone && m.channel !== "voice");
    const maxId = Math.max(0, ...mine.map((m) => m.id));
    if (seenMsg.current !== null) {
      mine
        .filter((m) => m.id > seenMsg.current!)
        .slice(0, 3)
        .forEach((m) => {
          const stripped = m.body.replace(/^StormShield:\s*/, "");
          const body = stripped.charAt(0).toUpperCase() + stripped.slice(1);
          const tone = /EMERGENCY|Evacuate|on the way|danger/i.test(m.body) ? "danger" : /approved|paid|safe|with you|recorded/i.test(m.body) ? "ok" : "info";
          push({ id: `m${m.id}`, tone, title: m.channel === "sms" ? "New SMS from StormShield" : "StormShield", body });
        });
    }
    seenMsg.current = Math.max(seenMsg.current ?? 0, maxId);
  }, [me.data, push]);

  const d = me.data;
  const snap = st.data?.snap ?? null;
  const place = useMemo(() => d?.places.find((p) => p.key === placeKey) ?? d?.places[0], [d, placeKey]);
  const refresh = () => {
    me.refresh();
    st.refresh();
  };

  const shareGps = async () => {
    setSharing(true);
    try {
      const p = await getPosition();
      await api("/api/me/location", { body: { lat: p.lat, lng: p.lng } });
      await me.refresh();
      setPlaceKey("gps");
    } catch (e) {
      push({ id: `gps${Date.now()}`, tone: "warn", title: "Location not shared", body: (e as Error).message });
    } finally {
      setSharing(false);
    }
  };

  if (!d || !place) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-mute">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const zone = place.zone;
  const urgent = d.places.some((p) => p.zone && rank(p.zone.level) >= 2);
  const placeLabel = `${place.label}${place.zoneName ? ` · ${place.zoneName}` : ""}`;
  const openTickets = d.tickets.filter((t) => t.status !== "resolved");
  const pendingFamily = d.family.filter((f) => f.status === "pending").length;
  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }>; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutGrid },
    { id: "family", label: "Family", icon: UsersRound, badge: pendingFamily || undefined },
    { id: "help", label: "Shelters & help", icon: Tent },
    { id: "insurance", label: "Insurance", icon: Umbrella, badge: d.insurance?.claims.filter((c) => !["settled", "rejected"].includes(c.status)).length || undefined },
    { id: "messages", label: "Calls & messages", icon: MessageSquareText },
  ];

  return (
    <div>
      <EventBanner event={st.data?.event} snap={st.data?.snap} />
      <PhoneCall call={d.activeCall} onChange={refresh} />
      <ToastStack toasts={toasts} dismiss={dismiss} />
      <main className="mx-auto max-w-[1400px] p-3 sm:p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {GREET[d.user.language] ?? "Hello"}, {d.user.firstName}
            </h1>
            <p className="text-sm text-mute">
              Your safety picture. <span className="text-dim">Updated {timeAgo(updated)}</span>
              <button onClick={refresh} className="ml-2 inline-flex items-center gap-1 text-xs text-brand hover:underline">
                <RefreshCw size={11} /> Refresh
              </button>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-line2 bg-panel p-1" role="tablist" aria-label="Location">
              {d.places.map((p) => {
                const Icon = PLACE_ICON[p.key as keyof typeof PLACE_ICON] ?? HomeIcon;
                const on = p.key === place.key;
                return (
                  <button key={p.key} role="tab" aria-selected={on} onClick={() => setPlaceKey(p.key)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-white/10 text-fg" : "text-mute hover:text-fg"}`}>
                    <Icon size={15} />
                    {p.label}
                    {p.zone && <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_META[p.zone.level].color }} />}
                  </button>
                );
              })}
            </div>
            {!d.places.some((p) => p.key === "gps") && (
              <button onClick={shareGps} className="btn btn-ghost !py-2 text-sm" disabled={sharing}>
                {sharing ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />} Use my location
              </button>
            )}
          </div>
        </div>

        <MissedCallsBanner calls={d.calls} />

        {/* The essentials: risk, what to do, check in, get help. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
          <div className="lg:col-span-5">
            <RiskCard zone={zone} place={placeLabel} noData={snap?.ok === false} />
          </div>
          <div className="lg:col-span-4">
            <CheckIn me={d} urgent={urgent} onChange={refresh} />
          </div>
          <div className="space-y-4 lg:col-span-3">
            <PanicButton user={d.user} onSent={refresh} />
            {openTickets.length > 0 && <HelpStatus tickets={d.tickets} onChange={refresh} />}
          </div>
        </div>

        <div className="sticky top-14 z-20 -mx-3 mt-5 border-b border-line bg-bg/90 px-3 backdrop-blur sm:mx-0 sm:px-0">
          <div className="flex gap-1 overflow-x-auto thin-scroll" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === t.id ? "border-brand text-fg" : "border-transparent text-mute hover:text-fg"}`}
              >
                <t.icon size={15} /> {t.label}
                {t.badge ? <span className="rounded-full bg-warn/20 px-1.5 text-[10px] text-warn">{t.badge}</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rise" key={tab}>
          {tab === "overview" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
              <div className="lg:col-span-5">
                <Impact zone={zone} eventId={st.data?.event.id ?? 0} place={placeLabel} />
              </div>
              <div className="lg:col-span-7">
                <MiniMap snap={snap} places={d.places} center={place.p} reports={st.data?.reports} />
              </div>
              <div className="lg:col-span-7">
                <AlertsFeed alerts={d.alerts} draft={d.draftLanguage} languageName={d.languageName} />
              </div>
              <div className="lg:col-span-5">{snap && <WeatherCard w={snap.weather} />}</div>
            </div>
          )}
          {tab === "family" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
              <Family family={d.family} onChange={refresh} />
              <div className="panel p-5 text-sm text-fg/85">
                <div className="label mb-2 flex items-center gap-1.5">
                  <BellRing size={13} /> How family safety works
                </div>
                <ul className="space-y-2">
                  <li>• Family members on StormShield appear automatically when they check in.</li>
                  <li>• For people without the app, tap <b>Ask to check in</b>: they get an SMS with a one-tap link.</li>
                  <li>• If StormShield can&apos;t reach you after 3 calls, your emergency contact and SOS family members are called and sent an SMS.</li>
                  <li>• If you press the emergency button, they get an SMS with your location.</li>
                </ul>
              </div>
            </div>
          )}
          {tab === "help" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
              <div className="lg:col-span-8">
                <ShelterLocator from={place.p} fromLabel={place.label.toLowerCase() === "current location" ? "your current location" : `your ${place.label.toLowerCase()}`} snap={snap} />
              </div>
              <div className="space-y-4 lg:col-span-4">
                <ReportHazard fallback={place.p} onDone={refresh} />
                <TicketHistory tickets={d.tickets} />
              </div>
            </div>
          )}
          {tab === "insurance" && <Insurance ins={d.insurance} onChange={refresh} />}
          {tab === "messages" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
              <CallHistory calls={d.calls} onChange={refresh} />
              <MessageLog messages={d.messages} myPhone={d.user.phone} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TicketHistory({ tickets }: { tickets: MeResponse["tickets"] }) {
  const done = tickets.filter((t) => t.status === "resolved");
  if (!done.length) return null;
  return (
    <div className="panel p-5">
      <div className="label mb-2">Past help requests</div>
      <ul className="space-y-1.5 text-sm">
        {done.map((t) => (
          <li key={t.id} className="flex justify-between gap-2">
            <span>{t.ref}</span>
            <span className="text-mute">{t.team ?? "Closed"} · {timeAgo(t.updated_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
