// Automated call + SMS outreach with up to 3 attempts, keypad responses and escalation.
// Telephony is simulated: calls ring in the resident's app (phone simulator); demo residents answer automatically.
import type { Exec } from "./alerts";
import { PLACES, ZONE_BY_ID, distanceKm, type Hazard, type LatLng } from "./geo";
import { OUTREACH, KEY_INFO, script, type Key, type OutreachKind } from "./outreach-text";
import { insurerName } from "./insurance";
import { ticketRef } from "./ids";
import type { Snapshot } from "./engine";

export interface CampaignInput {
  eventId: number;
  title: string;
  kind: OutreachKind;
  audience: "zone" | "vulnerable" | "insurer" | "single";
  zoneIds?: string[];
  insurerId?: string | null;
  userIds?: number[];
  createdBy?: number | null;
  auto?: boolean;
  message?: string | null;
  delaySec?: number;
}

export async function createCampaign(run: Exec, c: CampaignInput) {
  const params: unknown[] = [c.eventId];
  let where = `u.role = 'user'`;
  if (c.audience === "single") {
    if (!c.userIds?.length) return { campaignId: null, count: 0 };
    params.push(c.userIds);
    where += ` AND u.id = ANY($${params.length}::int[])`;
  } else {
    if (!c.zoneIds?.length) return { campaignId: null, count: 0 };
    params.push(c.zoneIds);
    where += ` AND (u.home_zone = ANY($${params.length}::text[]) OR u.work_zone = ANY($${params.length}::text[]))`;
    if (c.audience === "vulnerable") where += ` AND u.vulnerable <> ''`;
    if (c.audience === "insurer") {
      params.push(c.insurerId);
      where += ` AND u.insurer_id = $${params.length} AND u.insurer_consent`;
    }
  }
  // Never call someone twice at the same time; automatic campaigns also skip people already reached for this kind.
  where += ` AND NOT EXISTS (SELECT 1 FROM outreach_targets t WHERE t.user_id = u.id AND t.event_id = $1 AND t.status IN ('queued','ringing','in_call'))`;
  if (c.auto) {
    params.push(c.kind);
    where += ` AND NOT EXISTS (SELECT 1 FROM outreach_targets t JOIN outreach_campaigns oc ON oc.id = t.campaign_id
      WHERE t.user_id = u.id AND t.event_id = $1 AND oc.kind = $${params.length} AND t.status IN ('reached','unreached') AND t.updated_at > now() - interval '3 hours')`;
  }
  const users = await run(`SELECT u.id FROM users u WHERE ${where} ORDER BY (u.vulnerable <> '') DESC, u.id`, params);
  if (!users.length && c.audience !== "single") return { campaignId: null, count: 0 };
  if (!users.length) return { campaignId: null, count: 0 };
  const camp = await run(
    `INSERT INTO outreach_campaigns (event_id, title, kind, audience, zone_ids, insurer_id, message, created_by, auto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [c.eventId, c.title, c.kind, c.audience, (c.zoneIds ?? []).join(","), c.insurerId ?? null, c.message ?? null, c.createdBy ?? null, !!c.auto],
  );
  const campaignId = camp[0].id as number;
  const ids = users.map((u) => u.id as number);
  const delay = c.delaySec ?? 0;
  // Stagger calls 2 s apart, vulnerable people first.
  await run(
    `INSERT INTO outreach_targets (campaign_id, event_id, user_id, status, next_at)
     SELECT $1, $2, x.id, 'queued', now() + (($4::int + (x.ord - 1) * 2) || ' seconds')::interval FROM unnest($3::int[]) WITH ORDINALITY AS x(id, ord)`,
    [campaignId, c.eventId, ids, delay],
  );
  return { campaignId, count: ids.length };
}

function hash(n: number) {
  n = (n ^ 61) ^ (n >>> 16);
  n = n + (n << 3);
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return n >>> 0;
}

/** Deterministic behaviour of simulated residents. */
export function simPlan(targetId: number, attempt: number, vulnerable: boolean) {
  const v = hash(targetId * 31 + attempt * 7);
  const answers = v % 100 < [55, 62, 70][Math.min(2, attempt - 1)];
  const delaySec = 4 + ((v >>> 8) % 12);
  const r = (v >>> 16) % 100;
  let key: Key = r < 50 ? "1" : r < 78 ? "2" : r < 92 ? "3" : "4";
  if (vulnerable && key === "1" && (v >>> 24) % 2) key = "3";
  return { answers, delaySec, key };
}

interface TargetRow {
  id: number;
  campaign_id: number;
  event_id: number;
  user_id: number;
  status: string;
  attempts: number;
  ring_at: string | null;
  answered_at: string | null;
  sim: boolean;
  first_name: string;
  surname: string;
  phone: string;
  language: string;
  vulnerable: string;
  home_zone: string | null;
  home_lat: number;
  home_lng: number;
  gps_lat: number | null;
  gps_lng: number | null;
  emergency_name: string;
  emergency_phone: string;
  insurer_id: string | null;
  insurer_consent: boolean;
  kind: OutreachKind;
  message: string | null;
  audience: string;
  c_insurer: string | null;
}

const TARGET_SELECT = `SELECT t.id, t.campaign_id, t.event_id, t.user_id, t.status, t.attempts, t.ring_at, t.answered_at,
  u.sim, u.first_name, u.surname, u.phone, u.language, u.vulnerable, u.home_zone, u.home_lat, u.home_lng, u.gps_lat, u.gps_lng,
  u.emergency_name, u.emergency_phone, u.insurer_id, u.insurer_consent, c.kind, c.message, c.audience, c.insurer_id AS c_insurer,
  EXTRACT(EPOCH FROM (now() - t.ring_at))::float AS ring_age, EXTRACT(EPOCH FROM (now() - t.answered_at))::float AS call_age
  FROM outreach_targets t JOIN users u ON u.id = t.user_id JOIN outreach_campaigns c ON c.id = t.campaign_id`;

export function targetScript(t: { language: string; kind: OutreachKind; home_zone: string | null; message: string | null; c_insurer: string | null }) {
  const area = t.home_zone ? ZONE_BY_ID[t.home_zone]?.name ?? "your area" : "your area";
  const hazard: Hazard = "flood";
  return script({ lang: t.language, kind: t.kind, area, hazard, custom: t.message, insurer: insurerName(t.c_insurer) });
}

async function msg(run: Exec, t: { event_id: number; user_id: number }, toName: string, toPhone: string, channel: string, body: string) {
  await run(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,$5,$6)`, [t.event_id, t.user_id, toName, toPhone, channel, body]);
}

async function startAttempt(run: Exec, t: TargetRow) {
  const n = t.attempts + 1;
  await run(`UPDATE outreach_targets SET attempts = $2, status = 'ringing', ring_at = now(), answered_at = NULL, updated_at = now() WHERE id = $1`, [t.id, n]);
  await run(`INSERT INTO outreach_attempts (target_id, attempt) VALUES ($1,$2)`, [t.id, n]);
  const s = targetScript(t);
  const name = `${t.first_name} ${t.surname}`;
  if (n === 1) await msg(run, t, name, t.phone, "sms", `StormShield: ${s.local} Reply or open the app to check in.`);
  await msg(run, t, name, t.phone, "voice", `Call ${n} of ${OUTREACH.maxAttempts}: ${s.local}`);
}

async function closeAttempt(run: Exec, targetId: number, outcome: string, key: string | null = null) {
  await run(
    `UPDATE outreach_attempts SET ended_at = now(), outcome = $2, key = $3 WHERE id = (SELECT id FROM outreach_attempts WHERE target_id = $1 ORDER BY attempt DESC LIMIT 1)`,
    [targetId, outcome, key],
  );
}

async function missed(run: Exec, t: TargetRow, outcome: "no_answer" | "declined" | "no_key") {
  await closeAttempt(run, t.id, outcome);
  const name = `${t.first_name} ${t.surname}`;
  if (t.attempts < OUTREACH.maxAttempts) {
    const gap = OUTREACH.gapsSec[t.attempts - 1] ?? 60;
    await run(`UPDATE outreach_targets SET status = 'queued', next_at = now() + ($2 || ' seconds')::interval, updated_at = now() WHERE id = $1`, [t.id, String(gap)]);
    await msg(run, t, name, t.phone, "sms", `StormShield: we tried to call you about a flood warning (call ${t.attempts} of ${OUTREACH.maxAttempts}). We will call again shortly. Please check in on the app.`);
    return;
  }
  // Third call failed: escalate.
  await run(`UPDATE outreach_targets SET status = 'unreached', escalated = true, updated_at = now() WHERE id = $1`, [t.id]);
  const area = t.home_zone ? ZONE_BY_ID[t.home_zone]?.name ?? "a danger area" : "a danger area";
  const text = `StormShield: we could not reach ${name} after ${OUTREACH.maxAttempts} calls. They live in ${area}, which is under a flood warning. Please try to contact them or check on them.`;
  const contacts = await run(`SELECT name, phone FROM family WHERE user_id = $1 AND (is_contact OR linked_user_id IS NOT NULL)`, [t.user_id]);
  const all = [{ name: t.emergency_name, phone: t.emergency_phone }, ...contacts.map((c) => ({ name: c.name as string, phone: c.phone as string }))];
  const seen = new Set<string>();
  for (const c of all) {
    if (seen.has(c.phone)) continue;
    seen.add(c.phone);
    await msg(run, t, c.name, c.phone, "sms", text);
    await msg(run, t, c.name, c.phone, "voice", text);
  }
  // Vulnerable people get an automatic welfare check; everyone else waits in the admin "Unreached" queue.
  if (t.vulnerable) {
    const p: LatLng = t.gps_lat != null && t.gps_lng != null ? [t.gps_lat, t.gps_lng] : [t.home_lat, t.home_lng];
    const rows = await run(
      `INSERT INTO tickets (event_id, user_id, type, note, lat, lng, priority, source) VALUES ($1,$2,'welfare',$3,$4,$5,'high','escalation') RETURNING id`,
      [t.event_id, t.user_id, `No answer after ${OUTREACH.maxAttempts} calls. Vulnerable: ${t.vulnerable.replace(/,/g, ", ")}`, p[0], p[1]],
    );
    await run(`UPDATE outreach_targets SET ticket_id = $2 WHERE id = $1`, [t.id, rows[0].id]);
  }
}

export function nearestOpenShelter(p: LatLng, snap: Snapshot | null, flooded: (id: string) => boolean) {
  void snap;
  return PLACES.filter((x) => x.type === "shelter" && !flooded(x.id))
    .map((x) => ({ ...x, km: distanceKm(p, x.p) }))
    .sort((a, b) => a.km - b.km)[0];
}

/** Apply a keypad response (from the simulator or a simulated resident). */
export async function applyKey(run: Exec, t: TargetRow, key: Key, flooded: (id: string) => boolean) {
  if (key === "5") return { ticket: null as string | null };
  const info = KEY_INFO[key];
  const p: LatLng = t.gps_lat != null && t.gps_lng != null ? [t.gps_lat, t.gps_lng] : [t.home_lat, t.home_lng];
  const name = `${t.first_name} ${t.surname}`;
  await closeAttempt(run, t.id, "answered", key);
  let ticketId: number | null = null;
  if (key === "1" || key === "2") {
    await run(`INSERT INTO checkins (event_id, user_id, status, lat, lng, note) VALUES ($1,$2,$3,$4,$5,'Keypad response on outreach call')`, [t.event_id, t.user_id, key === "1" ? "safe" : "evacuating", p[0], p[1]]);
  } else {
    const urgent = key === "4";
    const open = await run(`SELECT id FROM tickets WHERE event_id = $1 AND user_id = $2 AND status <> 'resolved' ORDER BY id DESC LIMIT 1`, [t.event_id, t.user_id]);
    if (open.length) {
      ticketId = open[0].id;
      if (urgent) await run(`UPDATE tickets SET priority = 'urgent', updated_at = now() WHERE id = $1`, [ticketId]);
    } else {
      const rows = await run(
        `INSERT INTO tickets (event_id, user_id, type, note, lat, lng, priority, source) VALUES ($1,$2,$3,$4,$5,$6,$7,'call') RETURNING id`,
        [t.event_id, t.user_id, urgent ? "rescue" : "transport", urgent ? "Pressed 4 on outreach call: in danger now" : "Pressed 3 on outreach call: needs help to evacuate", p[0], p[1], urgent ? "urgent" : t.vulnerable ? "high" : "normal"],
      );
      ticketId = rows[0].id;
    }
    await run(`INSERT INTO checkins (event_id, user_id, status, lat, lng, note) VALUES ($1,$2,'need_help',$3,$4,'Keypad response on outreach call')`, [t.event_id, t.user_id, p[0], p[1]]);
  }
  if (key === "2") {
    if (t.insurer_id) await run(`UPDATE users SET mitigated_at = now() WHERE id = $1`, [t.user_id]);
    const sh = nearestOpenShelter(p, null, flooded);
    if (sh) {
      await msg(run, t, name, t.phone, "sms", `StormShield: nearest open shelter is ${sh.name} (${sh.km.toFixed(1)} km). Directions: https://www.google.com/maps/dir/?api=1&destination=${sh.p[0]},${sh.p[1]}`);
    }
  }
  await run(`UPDATE outreach_targets SET status = 'reached', key = $2, result = $3, ticket_id = coalesce($4, ticket_id), updated_at = now() WHERE id = $1`, [t.id, key, info.result, ticketId]);
  await msg(run, t, name, t.phone, "push", ticketId ? `Your response was recorded. Help request ${ticketRef(ticketId)} has been sent to responders.` : `Your response was recorded: ${info.effect.toLowerCase()}.`);
  return { ticket: ticketId ? ticketRef(ticketId) : null };
}

const lastRun = new Map<number, number>();

/** Advance all calls: start due calls, time out unanswered ones, let simulated residents respond. */
export async function processOutreach(run: Exec, eventId: number, flooded: (id: string) => boolean, force = false) {
  const now = Date.now();
  if (!force && now - (lastRun.get(eventId) ?? 0) < 2000) return;
  lastRun.set(eventId, now);

  const due = (await run(`${TARGET_SELECT} WHERE t.event_id = $1 AND t.status = 'queued' AND t.next_at <= now() ORDER BY t.next_at LIMIT 60`, [eventId])) as TargetRow[];
  for (const t of due) await startAttempt(run, t);

  const live = (await run(
    `${TARGET_SELECT} WHERE t.event_id = $1 AND t.status IN ('ringing','in_call')`,
    [eventId],
  )) as (TargetRow & { ring_age: number; call_age: number | null })[];
  for (const t of live) {
    if (t.sim) {
      const plan = simPlan(t.id, t.attempts, !!t.vulnerable);
      if (plan.answers && t.ring_age >= plan.delaySec) {
        await applyKey(run, t, plan.key, flooded);
        continue;
      }
    }
    if (t.status === "ringing" && t.ring_age > OUTREACH.ringSec) await missed(run, t, "no_answer");
    else if (t.status === "in_call" && (t.call_age ?? 0) > OUTREACH.answerWindowSec) await missed(run, t, "no_key");
  }

  // Responders arrive when their ETA passes.
  const arrived = await run(
    `UPDATE tickets SET status = 'on_scene', updated_at = now() WHERE event_id = $1 AND status = 'en_route' AND eta_at <= now() RETURNING id, user_id, unit_id`,
    [eventId],
  );
  for (const a of arrived) {
    await run(`UPDATE units SET status = 'on_scene' WHERE id = $1`, [a.unit_id]);
    const u = await run(`SELECT first_name, surname, phone FROM users WHERE id = $1`, [a.user_id]);
    const unit = await run(`SELECT name FROM units WHERE id = $1`, [a.unit_id]);
    if (u.length) await msg(run, { event_id: eventId, user_id: a.user_id }, `${u[0].first_name} ${u[0].surname}`, u[0].phone, "sms", `${unit[0]?.name ?? "Responders"} should now be with you (${ticketRef(a.id)}). If you cannot see them, call 112.`);
  }
}

export async function getTarget(run: Exec, id: number) {
  const rows = (await run(`${TARGET_SELECT} WHERE t.id = $1`, [id])) as TargetRow[];
  return rows[0] ?? null;
}

export async function respond(run: Exec, t: TargetRow, action: "answer" | "decline" | "key", key: Key | null, flooded: (id: string) => boolean) {
  if (action === "answer") {
    await run(`UPDATE outreach_targets SET status = 'in_call', answered_at = now(), updated_at = now() WHERE id = $1`, [t.id]);
    return { ticket: null };
  }
  if (action === "decline") {
    await missed(run, t, "declined");
    return { ticket: null };
  }
  if (!key) return { ticket: null };
  return applyKey(run, t, key, flooded);
}

/** Staff mark someone as reached (e.g. after a door-to-door visit). */
export async function markReached(run: Exec, targetId: number, note: string) {
  await run(`UPDATE outreach_targets SET status = 'reached', result = 'manual', note = $2, updated_at = now() WHERE id = $1`, [targetId, note]);
}
