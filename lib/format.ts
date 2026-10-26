export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60 ? `${m % 60} min ` : ""}ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function clock(iso: string | Date) {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Johannesburg" });
}

/** "now", "in 45 min", "in 2 h 15 min" */
export function inHours(h: number | null | undefined) {
  if (h === null || h === undefined) return "—";
  if (h <= 0.05) return "Now";
  const m = Math.round(h * 60);
  if (m < 60) return `in ${m} min`;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `in ${hh} h${mm ? ` ${mm} min` : ""}`;
}

export function hoursLabel(h: number) {
  if (h <= 0) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh} h${mm ? ` ${mm} min` : ""}`;
}

/** Drill clock: T+06:30 */
export function drillClock(h: number | null) {
  if (h === null) return "";
  const sign = h < 0 ? "−" : "+";
  const a = Math.abs(h);
  const hh = Math.floor(a);
  const mm = Math.floor((a - hh) * 60);
  return `T${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function km(d: number) {
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}

export function initials(first?: string, last?: string) {
  return `${(first ?? "?")[0] ?? ""}${(last ?? "")[0] ?? ""}`.toUpperCase();
}
