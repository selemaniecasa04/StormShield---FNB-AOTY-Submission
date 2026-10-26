"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, LogIn, LogOut, Map, Radar, ShieldAlert, Smartphone, Umbrella, UserPlus, UserRound, UserCog } from "lucide-react";
import { Logo } from "./ui";
import { useSession } from "@/hooks/useSession";
import { api, notifySession } from "@/lib/client";
import { initials } from "@/lib/format";

export default function AppHeader() {
  const path = usePathname();
  const router = useRouter();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    const h = (e: MouseEvent) => menu.current && !menu.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (path === "/map" || path.startsWith("/c/")) return null;

  const links = [
    { href: "/", label: "Live map", icon: Radar, show: true },
    { href: "/map", label: "Full map", icon: Map, show: true },
    { href: "/phone", label: "Feature phone", icon: Smartphone, show: true },
    { href: "/dashboard", label: "My safety", icon: LayoutDashboard, show: !!user && user.role === "user" },
    { href: "/admin", label: "Command centre", icon: ShieldAlert, show: user?.role === "admin" },
    { href: "/insurer", label: "Insurer portal", icon: Umbrella, show: user?.role === "insurer" },
  ].filter((l) => l.show);

  const logout = async () => {
    await api("/api/auth/logout", { body: {} });
    notifySession();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-[1500] border-b border-line bg-bg/85 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span className="text-[17px]">
            Storm<span className="text-brand">Shield</span>
          </span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-white/[.07] text-fg" : "text-mute hover:text-fg"}`}
              >
                <l.icon size={15} />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2" ref={menu}>
          {user === null && (
            <Link href="/register" className="btn btn-primary hidden !py-1.5 sm:inline-flex">
              Get alerts
            </Link>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={user ? "Account menu" : "Sign in or register"}
            aria-expanded={open}
            className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-semibold transition ${user ? "border-brand/50 bg-brand/15 text-brand" : "border-line2 bg-white/[.04] text-mute hover:text-fg"}`}
          >
            {user ? initials(user.firstName, user.surname) : <UserRound size={18} />}
          </button>
          {open && (
            <div className="rise absolute right-4 top-12 w-64 overflow-hidden rounded-xl border border-line2 bg-panel shadow-2xl">
              {user ? (
                <>
                  <div className="border-b border-line px-4 py-3">
                    <div className="font-semibold">
                      {user.firstName} {user.surname}
                    </div>
                    <div className="truncate text-xs text-mute">{user.email}</div>
                    {user.role !== "user" && <div className="mt-1 inline-block rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">{user.role === "admin" ? "Admin" : "Insurer"}</div>}
                  </div>
                  <MenuLink href={user.role === "admin" ? "/admin" : user.role === "insurer" ? "/insurer" : "/dashboard"} icon={user.role === "admin" ? ShieldAlert : user.role === "insurer" ? Umbrella : LayoutDashboard}>
                    {user.role === "admin" ? "Command centre" : user.role === "insurer" ? "Insurer portal" : "My safety dashboard"}
                  </MenuLink>
                  <MenuLink href="/map" icon={Map}>
                    Full-screen map
                  </MenuLink>
                  {user.role === "user" && (
                    <MenuLink href="/profile" icon={UserCog}>
                      Profile & settings
                    </MenuLink>
                  )}
                  <button onClick={logout} className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-left text-sm text-mute hover:bg-white/5 hover:text-fg">
                    <LogOut size={16} /> Sign out
                  </button>
                </>
              ) : (
                <>
                  <div className="border-b border-line px-4 py-3 text-sm text-mute">Get alerts for your home in your language.</div>
                  <MenuLink href="/login" icon={LogIn}>
                    Sign in
                  </MenuLink>
                  <MenuLink href="/register" icon={UserPlus}>
                    Create account
                  </MenuLink>
                </>
              )}
              <div className="border-t border-line md:hidden">
                {links.map((l) => (
                  <MenuLink key={l.href} href={l.href} icon={l.icon}>
                    {l.label}
                  </MenuLink>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, icon: Icon, children }: { href: string; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg/90 hover:bg-white/5">
      <Icon size={16} />
      {children}
    </Link>
  );
}
