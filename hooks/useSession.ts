"use client";
import { useCallback, useEffect, useState } from "react";
import { SESSION_EVENT, api } from "@/lib/client";
import type { SessionUser } from "@/lib/types";

let cached: SessionUser | null | undefined;

export function useSession() {
  const [user, setUser] = useState<SessionUser | null | undefined>(cached);
  const load = useCallback(async () => {
    try {
      const r = await api<{ user: SessionUser | null }>("/api/auth/me");
      cached = r.user;
      setUser(r.user);
    } catch {
      cached = null;
      setUser(null);
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(SESSION_EVENT, load);
    return () => window.removeEventListener(SESSION_EVENT, load);
  }, [load]);
  return { user, loading: user === undefined, reload: load };
}
