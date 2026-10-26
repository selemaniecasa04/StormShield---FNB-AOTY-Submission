import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { getSnapshot } from "@/lib/status";
import { getUser, publicUser, ticketRef } from "@/lib/users";
import { alertText, checkinText, isDraftLang, langName } from "@/lib/i18n";
import { ZONE_BY_ID, zoneAt, type Hazard, type LatLng } from "@/lib/geo";
import type { Level } from "@/lib/risk";
import { targetScript } from "@/lib/outreach";
import { menu, type OutreachKind } from "@/lib/outreach-text";
import { claimRef, hasPortal, insurerName } from "@/lib/insurance";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireUser();
  const u = await getUser(s.uid);
  const { snap, event } = await getSnapshot();
  const pu = publicUser(u);

  const zoneState = (id: string | null) => snap.zones.find((z) => z.id === id) ?? null;
  const places: { key: string; label: string; address: string; p: LatLng; zoneId: string | null }[] = [
    { key: "home", label: "Home", address: u.home_address, p: pu.home, zoneId: u.home_zone },
  ];
  if (pu.work) places.push({ key: "work", label: "Work", address: u.work_address ?? "Work", p: pu.work, zoneId: u.work_zone });
  if (pu.gps && u.gps_at && Date.now() - new Date(u.gps_at).getTime() < 12 * 3_600_000) {
    places.push({ key: "gps", label: "Current location", address: "Shared from this device", p: pu.gps, zoneId: zoneAt(pu.gps)?.id ?? null });
  }

  const zoneIds = [...new Set(places.map((p) => p.zoneId).filter(Boolean))] as string[];
  const params: unknown[] = [event.id, ...zoneIds];
  const zf = zoneIds.length ? ` OR zone_id IN (${zoneIds.map((_, i) => `$${i + 2}`).join(",")})` : "";
  const alerts = await q<{ id: number; zone_id: string | null; level: Level; hazard: Hazard; kind: string; custom: string | null; created_at: string }>(
    `SELECT id, zone_id, level, hazard, kind, custom, created_at FROM alerts WHERE event_id = $1 AND (zone_id IS NULL${zf}) ORDER BY created_at DESC, id DESC LIMIT 30`,
    params,
  );

  const latest = await one<{ status: string; created_at: string }>(
    `SELECT status, created_at FROM checkins WHERE event_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [event.id, u.id],
  );
  const history = await q<{ status: string; created_at: string }>(
    `SELECT status, created_at FROM checkins WHERE event_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 6`,
    [event.id, u.id],
  );

  const fam = await q<{
    id: number; name: string; relation: string; phone: string; is_contact: boolean; linked_user_id: number | null; token: string;
    status: string | null; status_event: number | null; status_at: string | null; pinged_at: string | null;
    l_status: string | null; l_at: string | null; l_zone: string | null; l_first: string | null; l_channel: string | null;
  }>(
    `SELECT f.*, c.status AS l_status, c.created_at AS l_at, lu.home_zone AS l_zone, lu.first_name AS l_first, lu.channel AS l_channel
     FROM family f
     LEFT JOIN users lu ON lu.id = f.linked_user_id
     LEFT JOIN LATERAL (SELECT status, created_at FROM checkins WHERE user_id = f.linked_user_id AND event_id = $2 ORDER BY created_at DESC LIMIT 1) c ON true
     WHERE f.user_id = $1 ORDER BY f.is_contact DESC, f.id`,
    [u.id, event.id],
  );

  const tickets = await q<{
    id: number; type: string; note: string | null; status: string; team: string | null; created_at: string; updated_at: string; people: number;
    lat: number; lng: number; unit_id: string | null; dispatched_at: string | null; eta_at: string | null; source: string;
    u_name: string | null; u_type: string | null; u_phone: string | null; u_lat: number | null; u_lng: number | null;
  }>(
    `SELECT t.id, t.type, t.note, t.status, t.team, t.created_at, t.updated_at, t.people, t.lat, t.lng, t.unit_id, t.dispatched_at, t.eta_at, t.source,
            n.name AS u_name, n.type AS u_type, n.phone AS u_phone, n.base_lat AS u_lat, n.base_lng AS u_lng
     FROM tickets t LEFT JOIN units n ON n.id = t.unit_id WHERE t.event_id = $1 AND t.user_id = $2 ORDER BY t.created_at DESC LIMIT 10`,
    [event.id, u.id],
  );

  // Call outreach: an active call (rings in the app) and recent call history.
  const calls = await q<{ id: number; status: string; attempts: number; key: string | null; result: string | null; ring_at: string | null; kind: OutreachKind; message: string | null; c_insurer: string | null; title: string; updated_at: string }>(
    `SELECT t.id, t.status, t.attempts, t.key, t.result, t.ring_at, t.updated_at, c.kind, c.message, c.insurer_id AS c_insurer, c.title
     FROM outreach_targets t JOIN outreach_campaigns c ON c.id = t.campaign_id WHERE t.event_id = $1 AND t.user_id = $2 ORDER BY t.id DESC LIMIT 5`,
    [event.id, u.id],
  );
  const attempts = calls.length
    ? await q<{ target_id: number; attempt: number; started_at: string; outcome: string | null; key: string | null }>(
        `SELECT target_id, attempt, started_at, outcome, key FROM outreach_attempts WHERE target_id = ANY($1::int[]) ORDER BY started_at`,
        [calls.map((c) => c.id)],
      )
    : [];
  const live = calls.find((c) => c.status === "ringing" || c.status === "in_call");
  const insured = !!u.insurer_id && u.insurer_consent;
  const activeCall = live
    ? {
        id: live.id,
        status: live.status,
        attempt: live.attempts,
        ringAt: live.ring_at,
        kind: live.kind,
        title: live.title,
        insurer: insurerName(live.c_insurer),
        script: targetScript({ language: u.language, kind: live.kind, home_zone: u.home_zone, message: live.message, c_insurer: live.c_insurer }),
        menu: menu(u.language, insured),
      }
    : null;

  const claims = insured
    ? await q<{ id: number; kind: string; description: string; status: string; validation: string; amount: number | null; assessor: string | null; created_at: string; updated_at: string }>(
        `SELECT id, kind, description, status, validation, amount, assessor, created_at, updated_at FROM claims WHERE user_id = $1 ORDER BY id DESC`,
        [u.id],
      )
    : [];

  const messages = await q<{ id: number; channel: string; body: string; to_name: string; to_phone: string; created_at: string }>(
    `SELECT id, channel, body, to_name, to_phone, created_at FROM messages WHERE event_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC LIMIT 30`,
    [event.id, u.id],
  );

  return json({
    user: pu,
    languageName: langName(u.language),
    draftLanguage: isDraftLang(u.language),
    checkinPrompt: { text: checkinText(u.language), english: checkinText("en") },
    places: places.map((p) => ({ ...p, zone: zoneState(p.zoneId), zoneName: p.zoneId ? ZONE_BY_ID[p.zoneId]?.name : null })),
    checkin: latest,
    checkinHistory: history,
    alerts: alerts.map((a) => {
      const area = a.zone_id ? ZONE_BY_ID[a.zone_id]?.name ?? "Area" : "eThekwini";
      const opts = { eased: a.kind === "eased", custom: a.custom };
      return {
        id: a.id,
        zoneId: a.zone_id,
        level: a.level,
        hazard: a.hazard,
        kind: a.kind,
        createdAt: a.created_at,
        local: alertText(u.language, a.hazard, a.level, area, opts),
        english: alertText("en", a.hazard, a.level, area, opts),
      };
    }),
    family: fam.map((f) => {
      const linked = !!f.linked_user_id;
      const status = linked ? f.l_status : f.status_event === event.id ? f.status : null;
      const at = linked ? f.l_at : f.status_event === event.id ? f.status_at : null;
      return {
        id: f.id,
        name: f.name,
        relation: f.relation,
        phone: f.phone,
        isContact: f.is_contact,
        linked,
        basicPhone: f.l_channel === "ussd",
        status: status ?? "pending",
        statusAt: at,
        pingedAt: f.pinged_at,
        zone: linked ? zoneState(f.l_zone) : null,
        token: f.token,
      };
    }),
    tickets: tickets.map((t) => ({
      id: t.id, ref: ticketRef(t.id), type: t.type, note: t.note, status: t.status, team: t.team, created_at: t.created_at, updated_at: t.updated_at,
      people: t.people, source: t.source, p: [t.lat, t.lng] as LatLng,
      unit: t.unit_id ? { id: t.unit_id, name: t.u_name, type: t.u_type, phone: t.u_phone, base: [t.u_lat, t.u_lng] as LatLng, dispatchedAt: t.dispatched_at, etaAt: t.eta_at } : null,
    })),
    activeCall,
    calls: calls.map((c) => ({ id: c.id, status: c.status, attempts: c.attempts, key: c.key, result: c.result, title: c.title, updatedAt: c.updated_at, tries: attempts.filter((a) => a.target_id === c.id) })),
    insurance: u.insurer_id
      ? {
          insurerId: u.insurer_id,
          insurer: insurerName(u.insurer_id),
          portal: hasPortal(u.insurer_id),
          policyNo: u.policy_no,
          cover: u.cover ? u.cover.split(",").filter(Boolean) : [],
          sumInsured: u.sum_insured,
          vehicle: u.vehicle_desc,
          consent: u.insurer_consent,
          mitigatedAt: u.mitigated_at,
          claims: claims.map((c) => ({ ...c, ref: claimRef(c.id) })),
        }
      : null,
    messages,
  });
});
