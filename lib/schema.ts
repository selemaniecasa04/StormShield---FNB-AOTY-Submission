// Schema migration and demo seed. Runs once per database on first request.
import bcrypt from "bcryptjs";
import { ZONES, zoneAt, pointInPolygon, type LatLng } from "./geo";
import { seedAlertHistory, type Exec } from "./alerts";
import { UNIT_SEED, etaMinutes, recommendType } from "./dispatch";
import { OUTREACH } from "./outreach-text";
import { simPlan } from "./outreach";
import { drillSnapshot } from "./engine";
import { validateClaim } from "./claims";

export const DEMO_PASSWORD = "Demo@2026";
export const STAFF_PASSWORD = "1234";
export const DRILL_TITLE = "KZN cut-off low · flood drill";
export const DRILL_START_HOUR = 6.5;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    home_address TEXT NOT NULL,
    home_lat DOUBLE PRECISION NOT NULL,
    home_lng DOUBLE PRECISION NOT NULL,
    home_zone TEXT,
    work_address TEXT,
    work_lat DOUBLE PRECISION,
    work_lng DOUBLE PRECISION,
    work_zone TEXT,
    gps_lat DOUBLE PRECISION,
    gps_lng DOUBLE PRECISION,
    gps_at TIMESTAMPTZ,
    language TEXT NOT NULL DEFAULT 'en',
    emergency_name TEXT NOT NULL,
    emergency_phone TEXT NOT NULL,
    medical TEXT,
    vulnerable TEXT NOT NULL DEFAULT '',
    demo BOOLEAN NOT NULL DEFAULT false,
    sim BOOLEAN NOT NULL DEFAULT false,
    org TEXT,
    insurer_id TEXT,
    policy_no TEXT,
    cover TEXT NOT NULL DEFAULT '',
    sum_insured INT,
    vehicle_desc TEXT,
    insurer_consent BOOLEAN NOT NULL DEFAULT false,
    mitigated_at TIMESTAMPTZ,
    channel TEXT NOT NULL DEFAULT 'app',
    consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    mode TEXT NOT NULL,
    title TEXT NOT NULL,
    anchor_hour DOUBLE PRECISION NOT NULL DEFAULT 0,
    anchor_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    speed DOUBLE PRECISION NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS zone_state (
    event_id INT NOT NULL,
    zone_id TEXT NOT NULL,
    level TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, zone_id)
  )`,
  `CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    zone_id TEXT,
    level TEXT NOT NULL,
    hazard TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'auto',
    custom TEXT,
    created_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS alerts_event ON alerts(event_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    to_name TEXT,
    to_phone TEXT,
    channel TEXT NOT NULL,
    body TEXT NOT NULL,
    alert_id INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS messages_user ON messages(user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS checkins (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS checkins_user ON checkins(event_id, user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    note TEXT,
    people INT NOT NULL DEFAULT 1,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'received',
    team TEXT,
    unit_id TEXT,
    dispatched_at TIMESTAMPTZ,
    eta_at TIMESTAMPTZ,
    priority TEXT NOT NULL DEFAULT 'normal',
    source TEXT NOT NULL DEFAULT 'app',
    created_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS family (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relation TEXT NOT NULL,
    phone TEXT NOT NULL,
    is_contact BOOLEAN NOT NULL DEFAULT false,
    linked_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    token TEXT NOT NULL UNIQUE,
    status TEXT,
    status_event INT,
    status_at TIMESTAMPTZ,
    pinged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    note TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    zone_id TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    source TEXT NOT NULL DEFAULT 'app',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_lat DOUBLE PRECISION NOT NULL,
    base_lng DOUBLE PRECISION NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    ticket_id INT
  )`,
  `CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    audience TEXT NOT NULL,
    zone_ids TEXT NOT NULL DEFAULT '',
    insurer_id TEXT,
    message TEXT,
    created_by INT,
    auto BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS outreach_targets (
    id SERIAL PRIMARY KEY,
    campaign_id INT NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    event_id INT NOT NULL,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INT NOT NULL DEFAULT 0,
    next_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ring_at TIMESTAMPTZ,
    answered_at TIMESTAMPTZ,
    key TEXT,
    result TEXT,
    note TEXT,
    ticket_id INT,
    escalated BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS outreach_targets_ev ON outreach_targets(event_id, status)`,
  `CREATE TABLE IF NOT EXISTS outreach_attempts (
    id SERIAL PRIMARY KEY,
    target_id INT NOT NULL REFERENCES outreach_targets(id) ON DELETE CASCADE,
    attempt INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    outcome TEXT,
    key TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS claims (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    insurer_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT NOT NULL,
    depth_cm INT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    photos TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'received',
    validation TEXT NOT NULL,
    validation_note TEXT NOT NULL,
    model_depth DOUBLE PRECISION,
    alerted_before BOOLEAN NOT NULL DEFAULT false,
    mitigated BOOLEAN NOT NULL DEFAULT false,
    assessor TEXT,
    amount INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Feature-phone sessions: USSD menus and voice-call (IVR) keypad answers, with a full step transcript.
  `CREATE TABLE IF NOT EXISTS phone_sessions (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    channel TEXT NOT NULL,
    session_id TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    target_id INT,
    service_code TEXT,
    network TEXT,
    origin TEXT NOT NULL DEFAULT 'simulator',
    lang TEXT NOT NULL DEFAULT 'en',
    steps TEXT NOT NULL DEFAULT '[]',
    state TEXT,
    outcome TEXT,
    outcome_label TEXT,
    detail TEXT NOT NULL DEFAULT '{}',
    final_text TEXT,
    ticket_id INT,
    report_id INT,
    zone_id TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS phone_sessions_ev ON phone_sessions(event_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS phone_sessions_phone ON phone_sessions(phone, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS audit (
    id SERIAL PRIMARY KEY,
    user_id INT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Upgrades for databases created by earlier versions.
  ...["sim BOOLEAN NOT NULL DEFAULT false", "org TEXT", "insurer_id TEXT", "policy_no TEXT", "cover TEXT NOT NULL DEFAULT ''", "sum_insured INT", "vehicle_desc TEXT", "insurer_consent BOOLEAN NOT NULL DEFAULT false", "mitigated_at TIMESTAMPTZ"].map(
    (c) => `ALTER TABLE users ADD COLUMN IF NOT EXISTS ${c}`,
  ),
  ...["unit_id TEXT", "dispatched_at TIMESTAMPTZ", "eta_at TIMESTAMPTZ", "priority TEXT NOT NULL DEFAULT 'normal'", "source TEXT NOT NULL DEFAULT 'app'", "created_by INT"].map(
    (c) => `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ${c}`,
  ),
  `ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'`,
  `ALTER TABLE reports ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'app'`,
];

export async function migrate(run: Exec) {
  for (const s of STATEMENTS) await run(s);
  const n = await run(`SELECT count(*)::int AS n FROM users`);
  if (n[0].n === 0) await seed(run);
  const u = await run(`SELECT count(*)::int AS n FROM units`);
  if (u[0].n === 0) {
    for (const x of UNIT_SEED) await run(`INSERT INTO units (id, name, type, base_lat, base_lng, phone) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [x.id, x.name, x.type, x.base[0], x.base[1], x.phone]);
  }
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Sibusiso", "Nomsa", "Themba", "Zanele", "Bongani", "Ayanda", "Lerato", "Mandla", "Precious", "Kagiso", "Nandi", "Sizwe", "Thabo", "Busisiwe", "Priya", "Rajesh", "Fatima", "Johan", "Annelie", "Lwazi", "Hlengiwe", "Mpho", "Sello", "Khanyisile", "Zodwa", "Andile", "Nokwanda", "Siyabonga", "Kavitha", "Musa", "Dumisani", "Palesa", "Vusi", "Thuli"];
const LAST = ["Ndlovu", "Zulu", "Khumalo", "Mthembu", "Ngcobo", "Dube", "Shabalala", "Cele", "Mkhize", "Naidoo", "Pillay", "Govender", "Nkosi", "Mahlangu", "Botha", "Mabaso", "Gumede", "Hadebe", "Sithole", "Moodley", "Chetty", "Majola", "Buthelezi", "Ntuli"];
const ZONE_WEIGHT: Record<string, number> = { umlazi: 6, isipingo: 4, merebank: 3, springfield: 3, inanda: 4, kwamashu: 2, umbilo: 2, chatsworth: 3, amanzimtoti: 2, cbd: 1, phoenix: 1, pinetown: 1, berea: 1, mayville: 1 };
const LANG_POOL = ["zu", "zu", "zu", "zu", "xh", "en", "en", "af", "st", "zu", "en", "xh", "tn", "nso"];
const VUL_POOL = ["elderly", "disabled", "wheelchair", "chronic", "pregnant"];

function pointIn(zoneId: string, r: () => number): LatLng {
  const z = ZONES.find((x) => x.id === zoneId)!;
  for (let i = 0; i < 30; i++) {
    const p: LatLng = [z.c[0] + (r() - 0.5) * 0.03, z.c[1] + (r() - 0.5) * 0.03];
    if (pointInPolygon(p, z.poly)) return [+p[0].toFixed(5), +p[1].toFixed(5)];
  }
  return z.c;
}

async function seed(run: Exec) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const staffHash = await bcrypt.hash(STAFF_PASSWORD, 10);
  const r = rng(2026);
  const ev = await run(
    `INSERT INTO events (mode, title, anchor_hour, anchor_at, speed, started_at) VALUES ('drill', $1, $2, now(), 0, now() - interval '390 minutes') RETURNING id`,
    [DRILL_TITLE, DRILL_START_HOUR],
  );
  const eventId = ev[0].id as number;
  const ago = (min: number) => `${Math.max(0, Math.round(min * 60))} seconds`;

  const insertUser = async (u: {
    first: string; last: string; phone: string; email: string; role?: string; home: string; hp: LatLng;
    work?: string; wp?: LatLng; lang: string; ecName: string; ecPhone: string; medical?: string; vul?: string[];
    sim?: boolean; org?: string; staff?: boolean;
    ins?: { policy: string; cover: string[]; sum: number; vehicle?: string; mitigated?: boolean } | null;
  }) => {
    const hz = zoneAt(u.hp)?.id ?? null;
    const wz = u.wp ? zoneAt(u.wp)?.id ?? null : null;
    const rows = await run(
      `INSERT INTO users (first_name, surname, phone, email, password_hash, role, home_address, home_lat, home_lng, home_zone,
        work_address, work_lat, work_lng, work_zone, language, emergency_name, emergency_phone, medical, vulnerable, demo, sim, org,
        insurer_id, policy_no, cover, sum_insured, vehicle_desc, insurer_consent, mitigated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING id`,
      [u.first, u.last, u.phone, u.email, u.staff ? staffHash : hash, u.role ?? "user", u.home, u.hp[0], u.hp[1], hz, u.work ?? null, u.wp?.[0] ?? null, u.wp?.[1] ?? null, wz,
        u.lang, u.ecName, u.ecPhone, u.medical ?? null, (u.vul ?? []).join(","), !!u.sim, u.org ?? null,
        u.ins || u.role === "insurer" ? "shieldsure" : null, u.ins?.policy ?? null, (u.ins?.cover ?? []).join(","), u.ins?.sum ?? null, u.ins?.vehicle ?? null, !!u.ins,
        u.ins?.mitigated ? new Date(Date.now() - 20 * 60000).toISOString() : null],
    );
    return rows[0].id as number;
  };

  // Staff accounts (password 1234).
  const selemani = await insertUser({ first: "Selemani", last: "Ecasa", phone: "+27820000001", email: "selemani@stormshield.demo", role: "admin", staff: true, org: "eThekwini Disaster Management", home: "Disaster Management Centre, Durban", hp: [-29.857, 31.022], lang: "en", ecName: "Ops desk", ecPhone: "+27313610000" });
  const ayanda = await insertUser({ first: "Ayanda", last: "Sibanda", phone: "+27820000002", email: "ayanda@stormshield.demo", role: "admin", staff: true, org: "eThekwini Disaster Management", home: "Disaster Management Centre, Durban", hp: [-29.857, 31.022], lang: "en", ecName: "Ops desk", ecPhone: "+27313610001" });
  await insertUser({ first: "Naledi", last: "Khumalo", phone: "+27820000003", email: "claims@shieldsure.demo", role: "insurer", staff: true, org: "ShieldSure Insurance", home: "ShieldSure, Umhlanga Ridge", hp: [-29.727, 31.07], lang: "en", ecName: "ShieldSure desk", ecPhone: "+27315550000" });

  const thandi = await insertUser({ first: "Thandi", last: "Mkhize", phone: "+27821110001", email: "thandi@stormshield.demo", home: "AA Section, Umlazi", hp: [-29.975, 30.896], work: "DUT Steve Biko Campus, Berea", wp: [-29.852, 31.007], lang: "zu", ecName: "Sipho Mkhize", ecPhone: "+27821110003", vul: [], ins: { policy: "SSI-480213", cover: ["contents", "vehicle"], sum: 520000, vehicle: "2019 Toyota Corolla" } });
  const sipho = await insertUser({ first: "Sipho", last: "Mkhize", phone: "+27821110003", email: "sipho@stormshield.demo", home: "Prospecton, Isipingo", hp: [-29.99, 30.93], lang: "zu", ecName: "Thandi Mkhize", ecPhone: "+27821110001", sim: true });
  const pieter = await insertUser({ first: "Pieter", last: "van der Merwe", phone: "+27821110004", email: "pieter@stormshield.demo", home: "Beach Road, Amanzimtoti", hp: [-30.047, 30.886], lang: "af", ecName: "Elna van der Merwe", ecPhone: "+27821110005", vul: ["elderly", "chronic"], medical: "Type 2 diabetes, insulin", ins: { policy: "SSI-302877", cover: ["building", "contents", "vehicle"], sum: 2150000, vehicle: "2016 Ford Ranger" } });

  // Gogo Nomvula uses a basic feature phone (no app): she gets voice calls and SMS, and answers by USSD (*120*7867#).
  const gogo = await insertUser({ first: "Nomvula", last: "Mkhize", phone: "+27831110002", email: "gogo@stormshield.demo", home: "J Section, Umlazi", hp: [-29.963, 30.884], lang: "zu", ecName: "Thandi Mkhize", ecPhone: "+27821110001", vul: ["elderly"], medical: "Uses a walking frame" });
  await run(`UPDATE users SET channel = 'ussd' WHERE id = $1`, [gogo]);

  // Residents spread across the city, weighted towards flood-prone areas. About half are ShieldSure customers.
  const pool = Object.entries(ZONE_WEIGHT).flatMap(([z, w]) => Array(w).fill(z) as string[]);
  const residents: { id: number; zone: string; vul: string[]; p: LatLng; insured: boolean }[] = [];
  const VEHICLES = ["2018 VW Polo", "2020 Toyota Hilux", "2015 Nissan NP200", "2021 Suzuki Swift", "2017 Hyundai i20", "2019 Kia Picanto", "2014 Toyota Quantum"];
  for (let i = 0; i < 40; i++) {
    const zone = pool[Math.floor(r() * pool.length)];
    const p = pointIn(zone, r);
    const vul = r() < 0.3 ? [VUL_POOL[Math.floor(r() * VUL_POOL.length)]] : [];
    const first = FIRST[i % FIRST.length];
    const last = LAST[Math.floor(r() * LAST.length)];
    const insured = r() < 0.5;
    const cover = insured ? (["building", "contents", "vehicle"] as const).filter((_, k) => r() < [0.5, 0.8, 0.7][k]) : [];
    if (insured && !cover.length) cover.push("contents");
    const sum = cover.reduce((a, c) => a + (c === "building" ? 600000 + Math.round(r() * 12) * 100000 : c === "contents" ? 120000 + Math.round(r() * 23) * 10000 : 160000 + Math.round(r() * 26) * 10000), 0);
    const id = await insertUser({
      first, last, phone: `+2783${String(2000000 + i * 7919).slice(-7)}`, email: `resident${i + 1}@stormshield.demo`,
      home: `${ZONES.find((z) => z.id === zone)!.name}`, hp: p, lang: LANG_POOL[Math.floor(r() * LANG_POOL.length)],
      ecName: `${FIRST[(i + 7) % FIRST.length]} ${last}`, ecPhone: `+2784${String(3000000 + i * 6007).slice(-7)}`, vul, sim: true,
      ins: insured ? { policy: `SSI-${String(310000 + i * 1373)}`, cover: [...cover], sum, vehicle: cover.includes("vehicle") ? VEHICLES[i % VEHICLES.length] : undefined } : null,
    });
    residents.push({ id, zone, vul, p, insured });
  }

  // Alert history up to the current drill hour (+ SMS/voice deliveries).
  await seedAlertHistory(run, eventId, DRILL_START_HOUR);

  // Response units.
  for (const x of UNIT_SEED) await run(`INSERT INTO units (id, name, type, base_lat, base_lng, phone) VALUES ($1,$2,$3,$4,$5,$6)`, [x.id, x.name, x.type, x.base[0], x.base[1], x.phone]);
  const busy = new Set<string>();
  const dispatch = async (ticketId: number, type: string, p: LatLng, createdMin: number) => {
    const t = recommendType(type);
    const unit = UNIT_SEED.filter((u) => u.type === t && !busy.has(u.id)).sort((a, b) => etaMinutes(a.base, p, t) - etaMinutes(b.base, p, t))[0];
    if (!unit) return;
    busy.add(unit.id);
    const disp = createdMin - 3;
    const eta = etaMinutes(unit.base, p, t);
    const onScene = disp - eta <= 0;
    await run(
      `UPDATE tickets SET unit_id = $2, dispatched_at = now() - $3::interval, eta_at = now() - $3::interval + ($4 || ' minutes')::interval, status = $5, team = $6 WHERE id = $1`,
      [ticketId, unit.id, ago(disp), String(eta), onScene ? "on_scene" : "en_route", unit.name],
    );
    await run(`UPDATE units SET status = $2, ticket_id = $3 WHERE id = $1`, [unit.id, onScene ? "on_scene" : "dispatched", ticketId]);
    await run(`INSERT INTO audit (user_id, actor, action, detail, created_at) VALUES ($1,$2,'dispatch',$3, now() - $4::interval)`, [
      r() < 0.5 ? selemani : ayanda, r() < 0.5 ? "Selemani Ecasa" : "Ayanda Sibanda", `${unit.name} dispatched to SS-${1000 + ticketId}`, ago(disp),
    ]);
  };

  // Check-ins and help tickets from residents in the danger zones.
  const hot = new Set(["umlazi", "isipingo", "merebank", "umbilo", "chatsworth", "inanda", "amanzimtoti", "cbd"]);
  const status = new Map<number, string>();
  const tickets = new Map<number, { id: number; type: string }>();
  for (const res of residents) {
    if (!hot.has(res.zone)) {
      if (r() < 0.4) {
        await run(`INSERT INTO checkins (event_id, user_id, status, lat, lng, created_at) VALUES ($1,$2,'safe',$3,$4, now() - $5::interval)`, [eventId, res.id, res.p[0], res.p[1], ago(Math.floor(r() * 120 + 5))]);
        status.set(res.id, "safe");
      }
      continue;
    }
    const x = r();
    const mins = Math.floor(r() * 80 + 6);
    let st: string | null = null;
    if (x < 0.4) st = "safe";
    else if (x < 0.54) st = "evacuating";
    else if (x < 0.68) st = "need_help";
    else if (x < 0.76 && res.vul.length) st = "vulnerable_present";
    if (!st) continue;
    status.set(res.id, st);
    await run(`INSERT INTO checkins (event_id, user_id, status, lat, lng, created_at) VALUES ($1,$2,$3,$4,$5, now() - $6::interval)`, [eventId, res.id, st, res.p[0], res.p[1], ago(mins)]);
    if (st === "need_help") {
      const types = ["rescue", "stranded", "flooded", "medical", "transport"];
      const type = types[Math.floor(r() * types.length)];
      const rows = await run(
        `INSERT INTO tickets (event_id, user_id, type, note, people, lat, lng, priority, source, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - $10::interval, now() - $10::interval) RETURNING id`,
        [eventId, res.id, type, ["Water rising in the house", "Cannot get out, road is under water", "Elderly parent cannot walk", "Car stuck in water", "No transport to the shelter"][Math.floor(r() * 5)], 1 + Math.floor(r() * 4), res.p[0], res.p[1],
          type === "rescue" ? "urgent" : res.vul.length ? "high" : "normal", r() < 0.5 ? "panic" : "call", ago(mins)],
      );
      tickets.set(res.id, { id: rows[0].id, type });
      if (r() < 0.6) await dispatch(rows[0].id, type, res.p, mins);
    }
  }
  await run(`INSERT INTO checkins (event_id, user_id, status, lat, lng, created_at) VALUES ($1,$2,'evacuating',-29.99,30.93, now() - interval '18 minutes')`, [eventId, sipho]);
  status.set(sipho, "evacuating");
  await run(`INSERT INTO checkins (event_id, user_id, status, lat, lng, created_at) VALUES ($1,$2,'evacuating',-30.047,30.886, now() - interval '41 minutes')`, [eventId, pieter]);
  status.set(pieter, "evacuating");

  // Call outreach history: red zones were called when they turned red; vulnerable people in orange zones got warning calls.
  const alertTimes = await run(
    `SELECT zone_id, level, EXTRACT(EPOCH FROM (now() - min(created_at)))::float / 60 AS mins FROM alerts WHERE event_id = $1 AND kind = 'auto' AND hazard <> 'road' AND level IN ('red','orange') GROUP BY zone_id, level`,
    [eventId],
  );
  const redZones = alertTimes.filter((a) => a.level === "red");
  const orangeZones = alertTimes.filter((a) => a.level === "orange" && !redZones.some((x) => x.zone_id === a.zone_id));
  const users = await run(`SELECT id, home_zone, vulnerable, first_name, surname, phone, emergency_name, emergency_phone, sim, insurer_id FROM users WHERE role = 'user'`);
  const { ringSec, gapsSec } = OUTREACH;
  let liveLeft = 3;
  const seedCampaign = async (zoneId: string, kind: "evacuate" | "warning", minsAgo: number) => {
    const audience = kind === "evacuate" ? "zone" : "vulnerable";
    const targets = users.filter((u) => u.home_zone === zoneId && (kind === "evacuate" || u.vulnerable));
    if (!targets.length) return;
    const camp = await run(
      `INSERT INTO outreach_campaigns (event_id, title, kind, audience, zone_ids, auto, created_at) VALUES ($1,$2,$3,$4,$5,true, now() - $6::interval) RETURNING id`,
      [eventId, `${kind === "evacuate" ? "Evacuation calls" : "Warning calls (vulnerable)"} · ${ZONES.find((z) => z.id === zoneId)!.name}`, kind, audience, zoneId, ago(minsAgo)],
    );
    let ord = 0;
    for (const u of targets) {
      const start = minsAgo - (ord++ * 2) / 60;
      const st = status.get(u.id);
      const tg = await run(`INSERT INTO outreach_targets (campaign_id, event_id, user_id, status, created_at) VALUES ($1,$2,$3,'queued', now() - $4::interval) RETURNING id`, [camp[0].id, eventId, u.id, ago(start)]);
      const tid = tg[0].id as number;
      const name = `${u.first_name} ${u.surname}`;
      const key = st === "safe" ? "1" : st === "evacuating" || st === "vulnerable_present" ? "2" : st === "need_help" ? (tickets.get(u.id)?.type === "rescue" ? "4" : "3") : null;
      // Answered on attempt 1 or 2; silent people missed all three calls.
      const answeredOn = key ? (simPlan(tid, 1, !!u.vulnerable).answers ? 1 : 2) : null;
      let t = start;
      const n = answeredOn ?? OUTREACH.maxAttempts;
      // Keep a few calls in progress so the console is live on first load.
      const keepLive = !key && u.sim && liveLeft > 0;
      const attempts = keepLive ? 1 : n;
      for (let a = 1; a <= attempts; a++) {
        const isAnswer = answeredOn === a;
        const dur = isAnswer ? 12 / 60 : ringSec / 60;
        await run(`INSERT INTO outreach_attempts (target_id, attempt, started_at, ended_at, outcome, key) VALUES ($1,$2, now() - $3::interval, now() - $4::interval, $5, $6)`, [tid, a, ago(t), ago(t - dur), isAnswer ? "answered" : "no_answer", isAnswer ? key : null]);
        await run(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body, created_at) VALUES ($1,$2,$3,$4,'voice',$5, now() - $6::interval)`, [eventId, u.id, name, u.phone, `Call ${a} of 3: StormShield ${kind === "evacuate" ? "evacuation" : "flood warning"} call`, ago(t)]);
        if (!isAnswer) await run(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body, created_at) VALUES ($1,$2,$3,$4,'sms',$5, now() - $6::interval)`, [eventId, u.id, name, u.phone, `StormShield: we tried to call you about a flood warning (call ${a} of 3). Please check in on the app.`, ago(t - dur)]);
        t -= dur + (gapsSec[a - 1] ?? 60) / 60;
      }
      if (keepLive) {
        liveLeft--;
        await run(`UPDATE outreach_targets SET attempts = 1, status = 'queued', next_at = now() + $2::interval, updated_at = now() WHERE id = $1`, [tid, `${8 + liveLeft * 9} seconds`]);
      } else if (key) {
        const result = { "1": "safe", "2": "preparing", "3": "needs_help", "4": "emergency" }[key];
        await run(`UPDATE outreach_targets SET attempts = $2, status = 'reached', key = $3, result = $4, ticket_id = $5, updated_at = now() - $6::interval WHERE id = $1`, [tid, n, key, result, tickets.get(u.id)?.id ?? null, ago(t)]);
        if (key === "2" && u.insurer_id) await run(`UPDATE users SET mitigated_at = now() - $2::interval WHERE id = $1`, [u.id, ago(t)]);
      } else {
        await run(`UPDATE outreach_targets SET attempts = 3, status = 'unreached', escalated = true, updated_at = now() - $2::interval WHERE id = $1`, [tid, ago(t)]);
        const text = `StormShield: we could not reach ${name} after 3 calls. They live in ${ZONES.find((z) => z.id === zoneId)!.name}, which is under a flood warning. Please try to contact them or check on them.`;
        await run(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body, created_at) VALUES ($1,$2,$3,$4,'sms',$5, now() - $6::interval), ($1,$2,$3,$4,'voice',$5, now() - $6::interval)`, [eventId, u.id, u.emergency_name, u.emergency_phone, text, ago(t)]);
        if (u.vulnerable) {
          const rows = await run(`INSERT INTO tickets (event_id, user_id, type, note, lat, lng, priority, source, created_at, updated_at) SELECT $1, id, 'welfare', $2, home_lat, home_lng, 'high', 'escalation', now() - $3::interval, now() - $3::interval FROM users WHERE id = $4 RETURNING id`, [eventId, `No answer after 3 calls. Vulnerable: ${u.vulnerable}`, ago(t), u.id]);
          await run(`UPDATE outreach_targets SET ticket_id = $2 WHERE id = $1`, [tid, rows[0].id]);
        }
      }
    }
  };
  for (const z of redZones) await seedCampaign(z.zone_id, "evacuate", z.mins);
  for (const z of orangeZones) await seedCampaign(z.zone_id, "warning", z.mins);

  // Thandi's family circle.
  const tok = () => Math.floor(r() * 36 ** 8).toString(36).padStart(8, "0") + Math.floor(r() * 36 ** 8).toString(36).padStart(8, "0");
  await run(`INSERT INTO family (user_id, name, relation, phone, linked_user_id, token, is_contact) VALUES ($1,'Sipho Mkhize','Brother','+27821110003',$2,$3,true)`, [thandi, sipho, tok()]);
  await run(`INSERT INTO family (user_id, name, relation, phone, linked_user_id, token, pinged_at) VALUES ($1,'Gogo Nomvula Mkhize','Mother','+27831110002',$2,$3, now() - interval '25 minutes')`, [thandi, gogo, tok()]);
  await run(`INSERT INTO family (user_id, name, relation, phone, token, status, status_event, status_at) VALUES ($1,'Lindiwe Mkhize','Daughter','+27831110006',$2,'safe',$3, now() - interval '32 minutes')`, [thandi, tok(), eventId]);
  await run(`INSERT INTO family (user_id, name, relation, phone, token, is_contact) VALUES ($1,'Elna van der Merwe','Partner','+27821110005',$2,true)`, [pieter, tok()]);

  // Community reports feed the risk engine.
  const reports: [string, string, LatLng, string, number, string][] = [
    ["flooded_road", "Water over Mangosuthu Hwy near the bridge", [-29.962, 30.906], "umlazi", 40, "verified"],
    ["rising_water", "River at the back of AA Section rising fast", [-29.972, 30.9], "umlazi", 22, "new"],
    ["flooded_road", "Old Main Rd flooded, cars turning back", [-29.997, 30.937], "isipingo", 35, "verified"],
    ["blocked_drain", "Storm drain blocked at Clairwood", [-29.929, 30.976], "merebank", 70, "new"],
    ["landslide", "Mud sliding onto houses near the stream", [-29.705, 30.94], "inanda", 55, "new"],
    ["power_out", "No electricity in V Section since 6am", [-29.966, 30.884], "umlazi", 48, "new"],
  ];
  for (const [kind, note, p, zone, mins, st] of reports) {
    await run(`INSERT INTO reports (event_id, user_id, kind, note, lat, lng, zone_id, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() - $9::interval)`, [eventId, residents[(mins * 7) % residents.length].id, kind, note, p[0], p[1], zone, st, ago(mins)]);
  }

  // A few early damage claims for the insurer portal.
  const snap = drillSnapshot(DRILL_START_HOUR);
  const claimants = residents.filter((x) => x.insured && ["isipingo", "umlazi", "berea", "durbannorth", "merebank"].includes(x.zone)).slice(0, 4);
  const CLAIMS: [string, string, number, string, number][] = [
    ["vehicle", "Car was parked in the street and water came up to the doors. Engine will not start.", 55, "assessor", 58],
    ["contents", "Water came into the lounge and kitchen, about knee height. Fridge, couch and carpets damaged.", 45, "received", 34],
    ["building", "Boundary wall collapsed and water damage to the garage.", 30, "received", 21],
    ["contents", "Ground floor flooded, furniture damaged.", 150, "received", 12],
  ];
  for (let i = 0; i < claimants.length; i++) {
    const c = claimants[i];
    const [kind, desc, depth, st, mins] = CLAIMS[i];
    const v = validateClaim(snap, c.p, depth);
    const u = users.find((x) => x.id === c.id)!;
    await run(
      `INSERT INTO claims (event_id, user_id, insurer_id, kind, description, depth_cm, lat, lng, status, validation, validation_note, model_depth, alerted_before, mitigated, assessor, created_at, updated_at)
       VALUES ($1,$2,'shieldsure',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13, now() - $14::interval, now() - $14::interval)`,
      [eventId, c.id, kind, desc, depth, c.p[0], c.p[1], st, v.validation, v.note, v.modelDepth, !!u.home_zone, st === "assessor" ? "M. Pillay (field assessor)" : null, ago(mins)],
    );
  }
}
