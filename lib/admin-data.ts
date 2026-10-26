import "server-only";
import { q } from "./db";
import { unitPosition, type UnitRow, type UnitType } from "./dispatch";
import { ticketRef } from "./ids";
import { ZONE_BY_ID, type LatLng } from "./geo";

interface UnitDb {
  id: string; name: string; type: UnitType; base_lat: number; base_lng: number; phone: string; status: UnitRow["status"]; ticket_id: number | null;
  t_lat: number | null; t_lng: number | null; dispatched_at: string | null; eta_at: string | null; t_status: string | null;
}

export async function loadUnits(): Promise<UnitRow[]> {
  const rows = await q<UnitDb>(
    `SELECT n.*, t.lat AS t_lat, t.lng AS t_lng, t.dispatched_at, t.eta_at, t.status AS t_status FROM units n LEFT JOIN tickets t ON t.id = n.ticket_id ORDER BY n.type, n.name`,
  );
  return rows.map((u) => {
    const base: LatLng = [u.base_lat, u.base_lng];
    const target: LatLng | null = u.t_lat != null && u.t_lng != null ? [u.t_lat, u.t_lng] : null;
    return {
      id: u.id, name: u.name, type: u.type, base, phone: u.phone, status: u.status, ticketId: u.ticket_id,
      p: u.status === "available" ? base : unitPosition(base, target, u.dispatched_at, u.eta_at, u.t_status ?? ""),
      etaAt: u.eta_at, ticketRef: u.ticket_id ? ticketRef(u.ticket_id) : null,
    };
  });
}

export async function outreachData(eventId: number, insurerId: string | null = null) {
  const filter = insurerId ? ` AND c.insurer_id = $2` : "";
  const params: unknown[] = insurerId ? [eventId, insurerId] : [eventId];
  const campaigns = await q<{ id: number; title: string; kind: string; audience: string; zone_ids: string; auto: boolean; created_at: string; by: string | null; insurer_id: string | null }>(
    `SELECT c.id, c.title, c.kind, c.audience, c.zone_ids, c.auto, c.created_at, c.insurer_id, u.first_name || ' ' || u.surname AS by
     FROM outreach_campaigns c LEFT JOIN users u ON u.id = c.created_by WHERE c.event_id = $1${filter} ORDER BY c.id DESC`,
    params,
  );
  const targets = await q<{
    id: number; campaign_id: number; user_id: number; status: string; attempts: number; key: string | null; result: string | null; ticket_id: number | null;
    escalated: boolean; updated_at: string; next_at: string; ring_at: string | null; name: string; phone: string; vulnerable: string; home_zone: string | null;
    language: string; emergency_name: string; emergency_phone: string; medical: string | null; insurer_id: string | null; home_lat: number; home_lng: number;
  }>(
    `SELECT t.id, t.campaign_id, t.user_id, t.status, t.attempts, t.key, t.result, t.ticket_id, t.escalated, t.updated_at, t.next_at, t.ring_at,
            u.first_name || ' ' || u.surname AS name, u.phone, u.vulnerable, u.home_zone, u.language, u.emergency_name, u.emergency_phone, u.medical, u.insurer_id, u.home_lat, u.home_lng
     FROM outreach_targets t JOIN users u ON u.id = t.user_id JOIN outreach_campaigns c ON c.id = t.campaign_id
     WHERE t.event_id = $1${filter} ORDER BY t.updated_at DESC`,
    params,
  );
  const attempts = await q<{ target_id: number; attempt: number; started_at: string; ended_at: string | null; outcome: string | null; key: string | null }>(
    `SELECT a.target_id, a.attempt, a.started_at, a.ended_at, a.outcome, a.key FROM outreach_attempts a JOIN outreach_targets t ON t.id = a.target_id JOIN outreach_campaigns c ON c.id = t.campaign_id
     WHERE t.event_id = $1${filter} ORDER BY a.started_at DESC LIMIT 400`,
    params,
  );
  const stats = (rows: typeof targets) => ({
    total: rows.length,
    queued: rows.filter((t) => t.status === "queued").length,
    ringing: rows.filter((t) => t.status === "ringing" || t.status === "in_call").length,
    reached: rows.filter((t) => t.status === "reached").length,
    unreached: rows.filter((t) => t.status === "unreached").length,
    safe: rows.filter((t) => t.result === "safe").length,
    preparing: rows.filter((t) => t.result === "preparing").length,
    help: rows.filter((t) => t.result === "needs_help" || t.result === "emergency").length,
  });
  return {
    stats: stats(targets),
    campaigns: campaigns.map((c) => ({
      ...c,
      zones: c.zone_ids ? c.zone_ids.split(",").map((z) => ZONE_BY_ID[z]?.name ?? z) : [],
      stats: stats(targets.filter((t) => t.campaign_id === c.id)),
    })),
    targets: targets.map((t) => ({
      id: t.id, campaignId: t.campaign_id, userId: t.user_id, status: t.status, attempts: t.attempts, key: t.key, result: t.result, ticketId: t.ticket_id,
      escalated: t.escalated, updatedAt: t.updated_at, nextAt: t.next_at, ringAt: t.ring_at, name: t.name, phone: t.phone,
      vulnerable: t.vulnerable ? t.vulnerable.split(",") : [], zone: t.home_zone ? ZONE_BY_ID[t.home_zone]?.name ?? null : null, language: t.language,
      emergency: `${t.emergency_name} · ${t.emergency_phone}`, medical: !!t.medical, insured: !!t.insurer_id, p: [t.home_lat, t.home_lng],
    })),
    attempts: attempts.map((a) => ({ targetId: a.target_id, attempt: a.attempt, startedAt: a.started_at, endedAt: a.ended_at, outcome: a.outcome, key: a.key })),
  };
}

