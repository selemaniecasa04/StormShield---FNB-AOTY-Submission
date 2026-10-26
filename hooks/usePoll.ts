"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/client";

/** Fetch a JSON endpoint and keep it fresh. Pauses while the tab is hidden. */
export function usePoll<T>(url: string | null, intervalMs = 15000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refresh = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const d = await api<T>(u);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    refresh();
    let t: ReturnType<typeof setInterval> | null = setInterval(refresh, intervalMs);
    const vis = () => {
      if (document.hidden) {
        if (t) clearInterval(t);
        t = null;
      } else if (!t) {
        refresh();
        t = setInterval(refresh, intervalMs);
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [url, intervalMs, refresh]);

  return { data, error, loading, refresh, setData };
}
