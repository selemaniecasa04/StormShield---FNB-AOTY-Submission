"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FileBarChart, LayoutDashboard, PhoneCall, Radio, Smartphone, Truck, Users, ClipboardList } from "lucide-react";
import { EventBanner } from "../panels";
import { StaffPulse } from "../Toasts";
import { usePoll } from "@/hooks/usePoll";
import { useSession } from "@/hooks/useSession";
import type { StatusResponse } from "@/lib/types";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/outreach", label: "Call outreach", icon: PhoneCall },
  { href: "/admin/phones", label: "Feature phones", icon: Smartphone },
  { href: "/admin/dispatch", label: "Dispatch", icon: Truck },
  { href: "/admin/reports", label: "Reports", icon: ClipboardList },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/sitrep", label: "Situation report", icon: FileBarChart },
];

export default function AdminShell({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, loading } = useSession();
  const { data } = usePoll<StatusResponse>("/api/status", 15000);
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== "admin") router.replace(user.role === "insurer" ? "/insurer" : "/dashboard");
  }, [user, loading, router]);
  return (
    <div>
      <EventBanner event={data?.event} snap={data?.snap} />
      <StaffPulse />
      <div className="border-b border-line bg-panel/60 print:hidden">
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-3 thin-scroll sm:px-4" aria-label="Command centre">
          {NAV.map((n) => {
            const on = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${on ? "border-brand text-fg" : "border-transparent text-mute hover:text-fg"}`}>
                <n.icon size={15} /> {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <main className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Radio size={22} className="text-brand" /> {title}
            </h1>
            <p className="text-sm text-mute">{sub ?? `eThekwini Disaster Management${user ? ` · signed in as ${user.firstName} ${user.surname}` : ""}`}</p>
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
