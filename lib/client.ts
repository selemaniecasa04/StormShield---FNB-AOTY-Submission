"use client";

export class ApiError extends Error {
  constructor(message: string, public status: number, public errors: Record<string, string> = {}) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) throw new ApiError(String(data.error ?? "Request failed."), res.status, (data.errors as Record<string, string>) ?? {});
  return data as T;
}

export const SESSION_EVENT = "ss:session";
export const notifySession = () => window.dispatchEvent(new Event(SESSION_EVENT));

/** Promise wrapper around the browser geolocation API. */
export function getPosition(timeout = 8000): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Location is not available on this device."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? "Location permission was denied." : "Could not get your location.")),
      { enableHighAccuracy: true, timeout, maximumAge: 60_000 },
    );
  });
}
