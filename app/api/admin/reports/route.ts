import { q, one } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, handle, json, num, str } from "@/lib/http";
import { audit, currentEvent } from "@/lib/status";
import { ZONE_BY_ID, zoneAt } from "@/lib/geo";
import { REPORT_KINDS, TICKET_SOURCE_LABEL, TICKET_STATUS_LABEL, TICKET_TYPES, type ReportKind, type TicketStatus, type TicketType } from "@/lib/risk";
import { ticketRef } from "@/lib/users";

export const dynamic = "force-dynamic";

export interface Incident {
  id: string;
  kind: "report" | "ticket";
  rawId: number;
  type: string;
  source: string;
  reporter: string;
  phone: string | null;
  zone: string | null;
  lat: number;
  lng: number;
  note: string | null;
  status: string;
  priority: string;
  createdAt: string;
  unit: string | null;
}

async function incidents(eventId: number): Promise<Incident[]> {
  const reports = await q<{ id: number; kind: string; note: string | null; lat: number; lng: number; zone_id: string | null; status: string; created_at: string; name: string | null; phone: string | null; source: string }>(
    `SELECT r.id, r.kind, r.note, r.lat, r.lng, r.zone_id, r.status, r.created_at, r.source, u.first_name || ' ' || u.surname AS name, u.phone
     FROM reports r LEFT JOIN users u ON u.id = r.user_id WHERE r.event_id = $1`,
    [eventId],
  );
  const tickets = await q<{ id: number; type: string; note: string | null; lat: number; lng: number; status: string; priority: string; source: string; created_at: string; name: string; phone: string; team: string | null }>(
    `SELECT t.id, t.type, t.note, t.lat, t.lng, t.status, t.priority, t.source, t.created_at, t.team, u.first_name || ' ' || u.surname AS name, u.phone
     FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.event_id = $1`,
    [eventId],
  );
  const zoneName = (z: string | null, lat: number, lng: number) => (z ? ZONE_BY_ID[z]?.name : zoneAt([lat, lng])?.name) ?? null;
  return [
    ...reports.map((r) => ({
      id: `R-${r.id}`, kind: "report" as const, rawId: r.id, type: REPORT_KINDS[r.kind as ReportKind] ?? r.kind, source: r.source === "ussd" ? "Community report (USSD)" : "Community report",
      reporter: r.name ?? "Anonymous", phone: r.phone, zone: zoneName(r.zone_id, r.lat, r.lng), lat: r.lat, lng: r.lng, note: r.note,
      status: r.status, priority: "normal", createdAt: r.created_at, unit: null,
    })),
    ...tickets.map((t) => ({
      id: ticketRef(t.id), kind: "ticket" as const, rawId: t.id, type: TICKET_TYPES[t.type as TicketType] ?? t.type, source: TICKET_SOURCE_LABEL[t.source] ?? t.source,
      reporter: t.name, phone: t.phone, zone: zoneName(null, t.lat, t.lng), lat: t.lat, lng: t.lng, note: t.note,
      status: TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status, priority: t.priority, createdAt: t.created_at, unit: t.team,
    })),
  ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection and quote everything.
  const numeric = /^[+-]?\d[\d\s.]*$/.test(s);
  const safe = !numeric && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const GET = handle(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const ev = await currentEvent();
  const rows = await incidents(ev.id);
  if (url.searchParams.get("format") === "csv") {
    const head = ["Reference", "Category", "Type", "Source", "Reported by", "Phone", "Area", "Latitude", "Longitude", "Details", "Status", "Priority", "Unit", "Reported at"];
    const lines = rows.map((r) => [r.id, r.kind, r.type, r.source, r.reporter, r.phone, r.zone, r.lat.toFixed(5), r.lng.toFixed(5), r.note, r.status, r.priority, r.unit, new Date(r.createdAt).toISOString()].map(csvCell).join(","));
    return new Response([head.map(csvCell).join(","), ...lines].join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="stormshield-incidents-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  }
  const auditRows = await q(`SELECT actor, action, detail, created_at FROM audit ORDER BY id DESC LIMIT 60`);
  return json({ incidents: rows, audit: auditRows });
});

/** Verify or dismiss a community report. Dismissed reports stop counting towards the risk score. */
export const PATCH = handle(async (req: Request) => {
  const s = await requireAdmin();
  const b = await body(req);
  const id = num(b.reportId);
  const status = str(b.status, 12);
  if (!id || !["verified", "dismissed", "new"].includes(status)) return json({ error: "Invalid request." }, 400);
  await q(`UPDATE reports SET status = $2 WHERE id = $1`, [id, status]);
  const me = await one<{ first_name: string; surname: string }>(`SELECT first_name, surname FROM users WHERE id = $1`, [s.uid]);
  await audit(s.uid, `${me?.first_name} ${me?.surname}`, "report", `Report R-${id} marked ${status}`);
  return json({ ok: true });
});
