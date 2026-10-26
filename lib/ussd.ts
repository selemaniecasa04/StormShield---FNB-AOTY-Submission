// USSD service (*120*7867#) for people without smartphones or data.
// Speaks the Africa's Talking / Clickatell style protocol: every request carries the whole input so far
// ("1*2*3"), and the reply starts with "CON " (more to come) or "END " (session over).
import "server-only";
import { q, one } from "./db";
import { ZONES, ZONE_BY_ID, SUBURBS, travelEstimate, zoneAt, type LatLng } from "./geo";
import { REPORT_KINDS, categoryOf, type ReportKind, type Level } from "./risk";
import { alertText, langName } from "./i18n";
import { createCampaign, nearestOpenShelter } from "./outreach";
import { ticketRef } from "./ids";
import { USSD_CODE } from "./emergency";
import type { Snapshot } from "./engine";
import type { UserRow } from "./users";
import {
  createPhoneUser, fullName, getSession, logStep, noteOpenTickets, notifyFamily, openSession, simulatorMayUse,
  sms, stopOutreach, userByPhone, userPoint,
} from "./phone";

type L = "en" | "zu";
type Data = Record<string, string | number | boolean | null>;
interface State { s: string; d: Data }

const AREAS = [...ZONES].sort((a, b) => a.name.localeCompare(b.name));
const PAGE = 6;

const CAT: Record<L, Record<string, string>> = {
  en: { SAFE: "SAFE", "LOW RISK": "LOW RISK", "MODERATE RISK": "MODERATE RISK", "HIGH RISK": "HIGH RISK", "EXTREME RISK": "EXTREME RISK" },
  zu: { SAFE: "AKUKHO INGOZI", "LOW RISK": "INGOZI ENCANE", "MODERATE RISK": "INGOZI EPHAKATHI", "HIGH RISK": "INGOZI ENKULU", "EXTREME RISK": "INGOZI EMBI KAKHULU" },
};

const T = {
  en: {
    main: ["I am safe", "I need help", "Flood risk", "Nearest shelter", "Report hazard", "Family", "Call me back", "Emergency nos"],
    toggle: "isiZulu",
    invalid: "Invalid choice.",
    back: "0 Back",
    safeQ: "Where are you now?",
    safeOpts: ["At home", "At a shelter", "With family/friends", "On my way to safety"],
    helpQ: "What help do you need?",
    helpOpts: ["Water in my home", "Trapped / cut off", "Medical emergency", "Transport to shelter", "Elderly/disabled help"],
    peopleQ: "How many people need help? Enter a number (1-20)",
    vulQ: "Is anyone elderly, disabled, ill, pregnant or a baby?\n1 Yes\n2 No",
    whereQ: (a: string) => `Where are you?\n1 At home (${a})\n2 Somewhere else`,
    landmarkQ: "Type the street, school, shop or landmark nearest to you:",
    repQ: "What are you reporting?",
    repWhere: "Where is it?\n1 Near my home\n2 Somewhere else (type it)",
    repLandmark: "Type the place (street, area or landmark):",
    famHead: "Family:",
    famNone: "No family linked yet. Ask your family to add this number in the StormShield app.",
    famOpts: ["Ask them to check in", "Tell them I am safe"],
    famSt: { safe: "SAFE", evacuating: "LEAVING", need_help: "NEEDS HELP", vulnerable_present: "NEEDS CHECK", pending: "no reply" } as Record<string, string>,
    callbackQ: "A disaster officer will call you back on this number.\n1 Confirm",
    numbers: "Emergency (free) 112\nAmbulance 10177\nPolice 10111\neThekwini Disaster/Fire 031 361 0000",
    safeDone: (n: string, w: string, fam: number) => `Thank you ${n}. You are marked SAFE (${w}).${fam ? ` ${fam} family member${fam > 1 ? "s" : ""} told.` : ""} SMS sent. Dial ${USSD_CODE} if anything changes.`,
    helpDone: (ref: string, label: string, n: number) => `Help request ${ref} sent (${label}, ${n} ${n === 1 ? "person" : "people"}). Stay on high ground. We will SMS you updates. Life in danger? Call 112.`,
    reportDone: (k: string, id: number) => `Thank you. Report R-${id} received: ${k}. It helps us warn your neighbours.`,
    pingDone: (n: number) => `We sent ${n} check-in request${n === 1 ? "" : "s"}. You will get an SMS when they reply.`,
    callbackDone: (ref: string) => `Call-back ${ref} logged. Keep your phone on. Life in danger? Call 112.`,
    riskTail: "Details sent by SMS.",
    shelterDone: (n: string, km: string, walk: number) => `Nearest open shelter: ${n}, ${km} km (~${walk} min walk). Directions sent by SMS.`,
    noShelter: "No open shelter found near you. Call 031 361 0000 or 112.",
    guest: ["Register for free alerts", "Flood risk in an area", "I need help now", "Emergency numbers"],
    guestHead: "Welcome to StormShield flood alerts",
    nameQ: "Enter your first name:",
    areaQ: (p: number, n: number) => `Choose your area (${p}/${n}):`,
    more: "8 More",
    langQ: "Alert language:\n1 English\n2 isiZulu\n3 isiXhosa\n4 Afrikaans\n5 Sesotho\n6 Sepedi\n7 Setswana",
    regVulQ: "Does anyone at home need extra help?\n1 Elderly\n2 Disabled/wheelchair\n3 Chronic illness\n4 Pregnant\n5 No",
    consentQ: "We store your number, name & area to send alerts and send help (POPIA). Opt out any time.\n1 I agree\n2 Cancel",
    cancelled: "Cancelled. Nothing was saved.",
    regDone: (n: string, a: string, l: string, hot: boolean) => `Welcome ${n}! Free SMS & voice alerts for ${a} in ${l}. Dial ${USSD_CODE} any time.${hot ? " Your area is at HIGH risk: we will call you now." : ""}`,
    ended: "This session has ended. Dial again to start over.",
  },
  zu: {
    main: ["Ngiphephile", "Ngidinga usizo", "Ingozi yezikhukhula", "Indawo yokukhosela", "Bika ingozi", "Umndeni", "Ngishayele", "Izinombolo"],
    toggle: "English",
    invalid: "Ukukhetha okungalungile.",
    back: "0 Emuva",
    safeQ: "Ukuphi manje?",
    safeOpts: ["Ekhaya", "Endaweni yokukhosela", "Nomndeni/abangane", "Ngisendleleni yokuphepha"],
    helpQ: "Udinga luphi usizo?",
    helpOpts: ["Amanzi endlini", "Ngivaleleke", "Isimo sezempilo", "Ukuthuthwa", "Usizo lwabadala"],
    peopleQ: "Bangaki abantu abadinga usizo? Faka inombolo (1-20)",
    vulQ: "Ingabe kukhona osekhulile, okhubazekile, ogulayo, okhulelwe noma usana?\n1 Yebo\n2 Cha",
    whereQ: (a: string) => `Ukuphi?\n1 Ekhaya (${a})\n2 Kwenye indawo`,
    landmarkQ: "Bhala umgwaqo, isikole, isitolo noma indawo eseduze nawe:",
    repQ: "Ubika ini?",
    repWhere: "Kuphi?\n1 Eduze nasekhaya\n2 Kwenye indawo (bhala)",
    repLandmark: "Bhala indawo (umgwaqo, isigodi noma uphawu):",
    famHead: "Umndeni:",
    famNone: "Akekho umndeni oxhunyiwe. Cela umndeni wakho ungeze le nombolo ku-app ye-StormShield.",
    famOpts: ["Bacele ukuthi baphendule", "Batshele ukuthi ngiphephile"],
    famSt: { safe: "UPHEPHILE", evacuating: "UYASUKA", need_help: "UDINGA USIZO", vulnerable_present: "HLOLA", pending: "akaphendulanga" } as Record<string, string>,
    callbackQ: "Isikhulu sezinhlekelele sizokushayela kule nombolo.\n1 Qinisekisa",
    numbers: "Izimo eziphuthumayo (mahhala) 112\nI-ambulensi 10177\nAmaphoyisa 10111\neThekwini Disaster/Fire 031 361 0000",
    safeDone: (n: string, w: string, fam: number) => `Siyabonga ${n}. Uphawulwe UPHEPHILE (${w}).${fam ? ` Kwaziswe abomndeni abangu-${fam}.` : ""} Kuthunyelwe i-SMS. Shayela ${USSD_CODE} uma kukhona okushintshayo.`,
    helpDone: (ref: string, label: string, n: number) => `Isicelo sosizo ${ref} sithunyelwe (${label}, abantu ${n}). Hlala endaweni ephakeme. Sizokuthumelela i-SMS. Ingozi yokuphila? Shayela u-112.`,
    reportDone: (k: string, id: number) => `Siyabonga. Umbiko R-${id} utholakele: ${k}. Usisiza ukuxwayisa omakhelwane.`,
    pingDone: (n: number) => `Sithumele izicelo ezingu-${n}. Uzothola i-SMS uma bephendula.`,
    callbackDone: (ref: string) => `Isicelo ${ref} sibhalisiwe. Gcina ifoni ivuliwe. Ingozi yokuphila? Shayela u-112.`,
    riskTail: "Imininingwane ithunyelwe nge-SMS.",
    shelterDone: (n: string, km: string, walk: number) => `Indawo yokukhosela evulekile eseduze: ${n}, ${km} km (~imizuzu engu-${walk} ngezinyawo). Izikhombisi-ndlela nge-SMS.`,
    noShelter: "Ayitholakalanga indawo yokukhosela evulekile. Shayela 031 361 0000 noma 112.",
    guest: ["Bhalisela izexwayiso mahhala", "Ingozi endaweni", "Ngidinga usizo manje", "Izinombolo eziphuthumayo"],
    guestHead: "Wamukelekile ku-StormShield",
    nameQ: "Faka igama lakho:",
    areaQ: (p: number, n: number) => `Khetha indawo yakho (${p}/${n}):`,
    more: "8 Okunye",
    langQ: "Ulimi lwezexwayiso:\n1 English\n2 isiZulu\n3 isiXhosa\n4 Afrikaans\n5 Sesotho\n6 Sepedi\n7 Setswana",
    regVulQ: "Ingabe ekhaya kukhona odinga usizo olwengeziwe?\n1 Osekhulile\n2 Okhubazekile\n3 Isifo esingapheli\n4 Okhulelwe\n5 Cha",
    consentQ: "Sigcina inombolo, igama nendawo yakho ukuze sikuxwayise futhi sikusize (POPIA). Ungayeka noma nini.\n1 Ngiyavuma\n2 Khansela",
    cancelled: "Kukhanseliwe. Akukho okugciniwe.",
    regDone: (n: string, a: string, l: string, hot: boolean) => `Wamukelekile ${n}! Izexwayiso mahhala ze-${a} ngesi-${l}. Shayela ${USSD_CODE} noma nini.${hot ? " Indawo yakho isengozini ENKULU: sizokushayela manje." : ""}`,
    ended: "Lesi sikhathi siphelile. Shayela futhi.",
  },
};

const HELP_TYPES = ["flooded", "rescue", "medical", "transport", "assistance"] as const;
const HELP_EN = T.en.helpOpts;
const SAFE_STATUS = ["safe", "safe", "safe", "evacuating"] as const;
const REPORT_IDS = Object.keys(REPORT_KINDS) as ReportKind[];
const LANG_CODES = ["en", "zu", "xh", "af", "st", "nso", "tn"];
const VUL_IDS = ["elderly", "disabled", "chronic", "pregnant"];
const TEXT_STATES = new Set(["help_landmark", "rep_landmark", "reg_name", "help_people"]);

interface Ctx {
  eventId: number;
  snap: Snapshot;
  flooded: (id: string) => boolean;
  phone: string;
  user: UserRow | null;
  lang: L;
  origin: "simulator" | "gateway";
  origin_url: string;
}

const list = (opts: readonly string[], from = 1) => opts.map((o, i) => `${i + from} ${o}`).join("\n");

function zoneLine(c: Ctx, zoneId: string | null) {
  const z = zoneId ? c.snap.zones.find((x) => x.id === zoneId) : null;
  if (!z || !c.snap.ok) return null;
  return { z, cat: CAT[c.lang][categoryOf(z.score)] ?? categoryOf(z.score) };
}

function areaPage(c: Ctx, page: number) {
  const n = Math.ceil(AREAS.length / PAGE);
  const items = AREAS.slice(page * PAGE, page * PAGE + PAGE).map((a) => a.name);
  return `${T[c.lang].areaQ(page + 1, n)}\n${list(items)}\n${page + 1 < n ? `${T[c.lang].more}\n` : ""}${T[c.lang].back}`;
}

// ---- Screens ----

function render(c: Ctx, st: State): string {
  const t = T[c.lang];
  const d = st.d;
  switch (st.s) {
    case "main": {
      const zl = zoneLine(c, c.user!.home_zone);
      const head = zl ? `StormShield: ${zl.z.name} ${zl.cat}` : "StormShield";
      return `${head}\n${list(t.main)}\n9 ${t.toggle}`;
    }
    case "guest":
      return `${t.guestHead}\n${list(t.guest)}\n9 ${t.toggle}`;
    case "safe_where":
      return `${t.safeQ}\n${list(t.safeOpts)}\n${t.back}`;
    case "help_type":
      return `${t.helpQ}\n${list(t.helpOpts)}\n${t.back}`;
    case "help_people":
      return t.peopleQ;
    case "help_vul":
      return t.vulQ;
    case "help_where":
      return t.whereQ(c.user ? c.user.home_address.slice(0, 28) : "");
    case "help_landmark":
    case "rep_landmark":
      return st.s === "help_landmark" ? t.landmarkQ : t.repLandmark;
    case "rep_kind":
      return `${t.repQ}\n${list(REPORT_IDS.map((k) => REPORT_KINDS[k]))}\n${t.back}`;
    case "rep_where":
      return t.repWhere;
    case "family":
      return String(d.screen ?? "");
    case "callback":
      return `${t.callbackQ}\n${t.back}`;
    case "reg_name":
      return t.nameQ;
    case "reg_area":
    case "g_risk_area":
    case "g_help_area":
      return areaPage(c, Number(d.page ?? 0));
    case "reg_lang":
      return t.langQ;
    case "reg_vul":
      return t.regVulQ;
    case "reg_consent":
      return t.consentQ;
  }
  return t.ended;
}

/** Move one step. Returns null for an invalid choice. */
function next(c: Ctx, st: State, input: string): State | null {
  const d = { ...st.d };
  const n = Number(input);
  const pick = (max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  switch (st.s) {
    case "main":
      if (input === "9") return { s: "main", d: { ...d, toggle: true } };
      if (!pick(8)) return null;
      return [
        { s: "safe_where", d },
        { s: "help_type", d },
        { s: "risk", d: { ...d, zoneId: c.user!.home_zone } },
        { s: "shelter", d },
        { s: "rep_kind", d },
        { s: "family", d },
        { s: "callback", d },
        { s: "numbers", d },
      ][n - 1];
    case "guest":
      if (input === "9") return { s: "guest", d: { ...d, toggle: true } };
      if (!pick(4)) return null;
      return [
        { s: "reg_name", d },
        { s: "g_risk_area", d: { ...d, page: 0 } },
        { s: "g_help_area", d: { ...d, page: 0 } },
        { s: "numbers", d },
      ][n - 1];
    case "safe_where":
      return pick(4) ? { s: "do_safe", d: { ...d, where: n } } : null;
    case "help_type":
      return pick(5) ? { s: "help_people", d: { ...d, help: n } } : null;
    case "help_people":
      return Number.isInteger(n) && n >= 1 && n <= 20 ? { s: "help_vul", d: { ...d, people: n } } : null;
    case "help_vul":
      if (!pick(2)) return null;
      return c.user ? { s: "help_where", d: { ...d, vul: n === 1 } } : { s: "help_landmark", d: { ...d, vul: n === 1 } };
    case "help_where":
      if (!pick(2)) return null;
      return n === 1 ? { s: "do_help", d: { ...d, atHome: true } } : { s: "help_landmark", d: { ...d, atHome: false } };
    case "help_landmark":
      return input.length >= 2 ? { s: "do_help", d: { ...d, landmark: input.slice(0, 80) } } : null;
    case "rep_kind":
      return pick(REPORT_IDS.length) ? { s: "rep_where", d: { ...d, kind: REPORT_IDS[n - 1] } } : null;
    case "rep_where":
      if (!pick(2)) return null;
      return n === 1 ? { s: "do_report", d } : { s: "rep_landmark", d };
    case "rep_landmark":
      return input.length >= 2 ? { s: "do_report", d: { ...d, landmark: input.slice(0, 80) } } : null;
    case "family":
      if (!d.hasFamily || !pick(2)) return null;
      return n === 1 ? { s: "do_family_ping", d } : { s: "do_safe", d: { ...d, where: 0 } };
    case "callback":
      return input === "1" ? { s: "do_callback", d } : null;
    case "reg_name":
      return input.length >= 2 && /[a-z]/i.test(input) ? { s: "reg_area", d: { ...d, name: input.slice(0, 40), page: 0 } } : null;
    case "reg_area":
    case "g_risk_area":
    case "g_help_area": {
      const page = Number(d.page ?? 0);
      if (input === "8" && (page + 1) * PAGE < AREAS.length) return { s: st.s, d: { ...d, page: page + 1 } };
      const a = AREAS[page * PAGE + n - 1];
      if (!Number.isInteger(n) || n < 1 || n > PAGE || !a) return null;
      if (st.s === "reg_area") return { s: "reg_lang", d: { ...d, zoneId: a.id } };
      if (st.s === "g_risk_area") return { s: "risk", d: { ...d, zoneId: a.id } };
      return { s: "help_type", d: { ...d, zoneId: a.id } };
    }
    case "reg_lang":
      return pick(7) ? { s: "reg_vul", d: { ...d, regLang: LANG_CODES[n - 1] } } : null;
    case "reg_vul":
      return pick(5) ? { s: "reg_consent", d: { ...d, vul: n <= 4 ? VUL_IDS[n - 1] : "" } } : null;
    case "reg_consent":
      if (!pick(2)) return null;
      return n === 1 ? { s: "do_register", d } : { s: "cancelled", d };
  }
  return null;
}

async function familyScreen(c: Ctx, st: State): Promise<State> {
  const t = T[c.lang];
  const u = c.user!;
  const own = await q<{ name: string; status: string | null; status_event: number | null; l_status: string | null }>(
    `SELECT f.name, f.status, f.status_event, c.status AS l_status FROM family f
     LEFT JOIN LATERAL (SELECT status FROM checkins WHERE user_id = f.linked_user_id AND event_id = $2 ORDER BY created_at DESC LIMIT 1) c ON true
     WHERE f.user_id = $1 ORDER BY f.is_contact DESC, f.id LIMIT 4`,
    [u.id, c.eventId],
  );
  const rev = await q<{ name: string; status: string | null }>(
    `SELECT o.first_name || ' ' || o.surname AS name, c.status FROM family f JOIN users o ON o.id = f.user_id
     LEFT JOIN LATERAL (SELECT status FROM checkins WHERE user_id = o.id AND event_id = $2 ORDER BY created_at DESC LIMIT 1) c ON true
     WHERE (f.linked_user_id = $1 OR f.phone = $3) AND f.user_id <> $1 LIMIT 4`,
    [u.id, c.eventId, u.phone],
  );
  const people = [
    ...own.map((f) => ({ name: f.name, status: f.l_status ?? (f.status_event === c.eventId ? f.status : null) })),
    ...rev.filter((r) => !own.some((o) => o.name === r.name)),
  ].slice(0, 4);
  if (!people.length) return { s: "family", d: { ...st.d, hasFamily: false, screen: `${t.famNone}\n${t.back}` } };
  const lines = people.map((p) => `${p.name.split(" ").slice(0, 2).join(" ")}: ${t.famSt[p.status ?? "pending"] ?? p.status}`);
  return { s: "family", d: { ...st.d, hasFamily: true, screen: `${t.famHead}\n${lines.join("\n")}\n${list(t.famOpts)}\n${t.back}` } };
}

// ---- Actions (terminal screens) ----

interface Done { text: string; outcome: string; label: string; ticketId?: number; reportId?: number; userId?: number; zoneId?: string | null; detail?: Data }

async function doSafe(c: Ctx, d: Data): Promise<Done> {
  const u = c.user!;
  const w = Number(d.where ?? 0);
  const status = w ? SAFE_STATUS[w - 1] : "safe";
  const whereEn = w ? T.en.safeOpts[w - 1] : "told family";
  const whereLocal = w ? (c.lang === "en" ? T.en.safeOpts[w - 1].toLowerCase() : T[c.lang].safeOpts[w - 1]) : c.lang === "zu" ? "kwaziswe umndeni" : "told family";
  const p = userPoint(u);
  await q(`INSERT INTO checkins (event_id, user_id, status, lat, lng, note) VALUES ($1,$2,$3,$4,$5,$6)`, [c.eventId, u.id, status, p[0], p[1], `USSD ${USSD_CODE}: ${whereEn}`]);
  await stopOutreach(c.eventId, u.id, "ussd_checkin");
  const time = new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
  await noteOpenTickets(c.eventId, u.id, `${time} checked in ${status === "safe" ? "SAFE" : "EVACUATING"} by USSD: ${whereEn}`);
  const fam = await notifyFamily(c.eventId, u, status, `StormShield: ${fullName(u)} checked in ${status === "safe" ? "SAFE" : "LEAVING FOR SAFETY"} from a basic phone (USSD) at ${time}: ${whereEn.toLowerCase()}.`);
  await sms(c.eventId, u.id, fullName(u), u.phone, `StormShield: you are marked ${status === "safe" ? "SAFE" : "on your way to safety"} (${whereEn.toLowerCase()}). Thank you. If anything changes dial ${USSD_CODE}.`);
  return {
    text: T[c.lang].safeDone(u.first_name, whereLocal, fam.length),
    outcome: status === "safe" ? "safe" : "evacuating",
    label: status === "safe" ? `Checked in SAFE (${whereEn})` : `Evacuating (${whereEn})`,
    detail: { ...d, status, where: whereEn, familyNotified: fam.join(", ") || null },
  };
}

function landmarkPoint(text: string | null | undefined, fallback: LatLng): { p: LatLng; matched: string | null } {
  if (!text) return { p: fallback, matched: null };
  const t = text.toLowerCase();
  const hit = SUBURBS.find((s) => t.includes(s.name.toLowerCase()) || s.name.toLowerCase().split(/[ &]+/).some((w) => w.length > 4 && t.includes(w)));
  return hit ? { p: hit.p, matched: hit.name } : { p: fallback, matched: null };
}

async function doHelp(c: Ctx, d: Data): Promise<Done> {
  let u = c.user;
  if (!u) {
    // Not registered: open a minimal record so responders can find and call them (vital interest).
    u = await createPhoneUser({ phone: c.phone, first: "Unregistered caller", zoneId: String(d.zoneId), lang: c.lang, vulnerable: [], origin: c.origin, note: d.vul ? "Created from a USSD help request; said a vulnerable person is present" : "Created from a USSD help request" });
    c.user = u;
  }
  const h = Number(d.help) - 1;
  const type = HELP_TYPES[h];
  const labelEn = HELP_EN[h];
  const people = Number(d.people ?? 1);
  const urgent = type === "rescue" || type === "medical";
  const priority = urgent ? "urgent" : d.vul || u.vulnerable ? "high" : "normal";
  const home = c.user && d.zoneId == null ? userPoint(u) : ZONE_BY_ID[String(d.zoneId ?? u.home_zone)]?.c ?? userPoint(u);
  const lm = d.atHome ? { p: userPoint(u), matched: null } : landmarkPoint(d.landmark as string | null, home);
  const note = [
    `USSD ${USSD_CODE}: ${labelEn}`,
    `${people} ${people === 1 ? "person" : "people"}`,
    d.vul ? "vulnerable person present" : null,
    d.atHome ? `at home (${u.home_address})` : d.landmark ? `near "${d.landmark}"${lm.matched ? ` (matched ${lm.matched})` : " (location approximate: registered area)"}` : null,
  ].filter(Boolean).join(" · ");
  const open = await one<{ id: number }>(`SELECT id FROM tickets WHERE event_id = $1 AND user_id = $2 AND status <> 'resolved' ORDER BY id DESC LIMIT 1`, [c.eventId, u.id]);
  let id: number;
  if (open) {
    id = open.id;
    await q(
      `UPDATE tickets SET note = coalesce(note, '') || $2, people = greatest(people, $3), priority = CASE WHEN $4 = 'urgent' OR priority = 'urgent' THEN 'urgent' WHEN $4 = 'high' OR priority = 'high' THEN 'high' ELSE 'normal' END,
         type = CASE WHEN $5 THEN $6 ELSE type END, updated_at = now() WHERE id = $1`,
      [id, ` [${note}]`, people, priority, urgent, type],
    );
  } else {
    const rows = await q<{ id: number }>(
      `INSERT INTO tickets (event_id, user_id, type, note, people, lat, lng, priority, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ussd') RETURNING id`,
      [c.eventId, u.id, type, note, people, lm.p[0], lm.p[1], priority],
    );
    id = rows[0].id;
  }
  const ref = ticketRef(id);
  await q(`INSERT INTO checkins (event_id, user_id, status, lat, lng, note) VALUES ($1,$2,'need_help',$3,$4,$5)`, [c.eventId, u.id, lm.p[0], lm.p[1], note]);
  await stopOutreach(c.eventId, u.id, "ussd_help");
  await sms(c.eventId, u.id, fullName(u), u.phone, `StormShield: help request ${ref} received (${labelEn}, ${people} ${people === 1 ? "person" : "people"}). Responders are being assigned. Stay on high ground and keep your phone on.`);
  if (u.emergency_phone) await sms(c.eventId, u.id, u.emergency_name, u.emergency_phone, `StormShield: ${fullName(u)} asked for help from a basic phone (USSD): ${labelEn}. Ref ${ref}. Location: https://maps.google.com/?q=${lm.p[0]},${lm.p[1]}`);
  await notifyFamily(c.eventId, u, "need_help", `StormShield: ${fullName(u)} asked for help by USSD: ${labelEn}, ${people} ${people === 1 ? "person" : "people"}. Ref ${ref}. Responders have been alerted.`);
  return {
    text: T[c.lang].helpDone(ref, T[c.lang].helpOpts[h], people),
    outcome: "help",
    label: `Help: ${labelEn} (${ref})`,
    ticketId: id,
    userId: u.id,
    zoneId: u.home_zone,
    detail: { ...d, help: labelEn, ticketType: type, priority, people, vulnerable: !!d.vul, location: d.atHome ? "Registered home address" : lm.matched ? `Landmark matched: ${lm.matched}` : d.landmark ? "Registered area (landmark not matched)" : "Registered area", lat: lm.p[0], lng: lm.p[1] },
  };
}

async function doReport(c: Ctx, d: Data): Promise<Done> {
  const u = c.user!;
  const kind = String(d.kind) as ReportKind;
  const lm = landmarkPoint(d.landmark as string | null, userPoint(u));
  const zoneId = zoneAt(lm.p)?.id ?? u.home_zone;
  const rows = await q<{ id: number }>(
    `INSERT INTO reports (event_id, user_id, kind, note, lat, lng, zone_id, source) VALUES ($1,$2,$3,$4,$5,$6,$7,'ussd') RETURNING id`,
    [c.eventId, u.id, kind, d.landmark ? `USSD: near "${d.landmark}"${lm.matched ? ` (matched ${lm.matched})` : " (approximate: reporter's area)"}` : "USSD: near reporter's home", lm.p[0], lm.p[1], zoneId],
  );
  return { text: T[c.lang].reportDone(REPORT_KINDS[kind], rows[0].id), outcome: "report", label: `Reported: ${REPORT_KINDS[kind]}`, reportId: rows[0].id, detail: { ...d, kind: REPORT_KINDS[kind], lat: lm.p[0], lng: lm.p[1] } };
}

async function doRisk(c: Ctx, d: Data): Promise<Done> {
  const zoneId = String(d.zoneId ?? c.user?.home_zone ?? "");
  const z = c.snap.zones.find((x) => x.id === zoneId);
  if (!z || !c.snap.ok) return { text: "No live risk data right now. Listen to radio and SAWS warnings. Emergency: 112.", outcome: "info_risk", label: "Asked for flood risk (no data)" };
  const cat = CAT[c.lang][categoryOf(z.score)];
  const a = alertText(c.lang, z.hazard, z.level as Level, z.name);
  const hrs = z.peakIn < 1 ? (c.lang === "zu" ? "ngaphansi kwehora" : "under 1h") : `${Math.round(z.peakIn)}h`;
  const peak = z.peakIn > 0.2 ? (c.lang === "zu" ? `Kuphakama: ${hrs}.` : `Peak in ${hrs}.`) : c.lang === "zu" ? "Sekuphakeme manje." : "At peak now.";
  const text = `${z.name}: ${cat} (${z.score}/100). ${peak} ${a.body} ${T[c.lang].riskTail}`.replace(/\s+/g, " ");
  if (c.user) {
    const en = alertText("en", z.hazard, z.level as Level, z.name);
    await sms(c.eventId, c.user.id, fullName(c.user), c.user.phone, `StormShield: ${z.name} is at ${categoryOf(z.score)} (${z.score}/100).${z.peakIn > 0.2 ? ` Peak expected in about ${z.peakIn < 1 ? "under an hour" : `${Math.round(z.peakIn)} h`}` : " At peak now"}, water up to ${z.depthM.toFixed(1)} m in low areas. ${en.body}`);
  }
  return { text, outcome: "info_risk", label: `Checked flood risk: ${z.name} (${categoryOf(z.score)})`, zoneId: z.id, detail: { ...d, area: z.name, score: z.score, level: z.level } };
}

async function doShelter(c: Ctx, d: Data): Promise<Done> {
  const u = c.user!;
  const p = userPoint(u);
  const sh = nearestOpenShelter(p, c.snap, c.flooded);
  if (!sh) return { text: T[c.lang].noShelter, outcome: "info_shelter", label: "Asked for shelter (none open)" };
  const tr = travelEstimate(sh.km);
  await sms(c.eventId, u.id, fullName(u), u.phone, `StormShield: nearest open shelter is ${sh.name}, ${sh.km.toFixed(1)} km (about ${tr.walkMin} min on foot, ${tr.driveMin} min by car). Directions: https://www.google.com/maps/dir/?api=1&destination=${sh.p[0]},${sh.p[1]}`);
  return { text: T[c.lang].shelterDone(sh.name, sh.km.toFixed(1), tr.walkMin), outcome: "info_shelter", label: `Asked for nearest shelter: ${sh.name}`, detail: { ...d, shelter: sh.name, km: +sh.km.toFixed(1) } };
}

async function doFamilyPing(c: Ctx, d: Data): Promise<Done> {
  const u = c.user!;
  const own = await q<{ id: number; name: string; phone: string; token: string }>(`SELECT id, name, phone, token FROM family WHERE user_id = $1`, [u.id]);
  for (const f of own) {
    await q(`UPDATE family SET pinged_at = now() WHERE id = $1`, [f.id]);
    await sms(c.eventId, u.id, f.name, f.phone, `StormShield: ${u.first_name} wants to know you are safe. Tap to check in: ${c.origin_url}/c/${f.token} or dial ${USSD_CODE}.`);
  }
  const rev = await notifyFamily(c.eventId, u, null, `StormShield: ${fullName(u)} (basic phone) is asking if you are safe. Please check in on the app.`);
  const n = own.length + rev.length;
  return { text: T[c.lang].pingDone(n), outcome: "family", label: `Asked ${n} family member${n === 1 ? "" : "s"} to check in`, detail: { ...d, asked: [...own.map((f) => f.name), ...rev].join(", ") } };
}

async function doCallback(c: Ctx, d: Data): Promise<Done> {
  const u = c.user!;
  const p = userPoint(u);
  const rows = await q<{ id: number }>(
    `INSERT INTO tickets (event_id, user_id, type, note, lat, lng, priority, source) VALUES ($1,$2,'assistance',$3,$4,$5,$6,'ussd') RETURNING id`,
    [c.eventId, u.id, `USSD ${USSD_CODE}: asked for a call back from a disaster officer`, p[0], p[1], u.vulnerable ? "high" : "normal"],
  );
  return { text: T[c.lang].callbackDone(ticketRef(rows[0].id)), outcome: "callback", label: `Asked for a call back (${ticketRef(rows[0].id)})`, ticketId: rows[0].id, detail: d };
}

async function doRegister(c: Ctx, d: Data): Promise<Done> {
  const zoneId = String(d.zoneId);
  const lang = String(d.regLang ?? "en");
  const u = await createPhoneUser({ phone: c.phone, first: String(d.name), zoneId, lang, vulnerable: d.vul ? [String(d.vul)] : [], origin: c.origin });
  c.user = u;
  const z = c.snap.zones.find((x) => x.id === zoneId);
  const hot = !!z && (z.level === "red" || z.level === "orange");
  await sms(c.eventId, u.id, fullName(u), u.phone, `StormShield: welcome ${u.first_name}. You will get free flood alerts for ${ZONE_BY_ID[zoneId].name} by SMS and voice call in ${langName(lang)}. Dial ${USSD_CODE} to check in, ask for help or find a shelter. Reply STOP to opt out.`);
  if (hot && z) {
    await createCampaign(q, { eventId: c.eventId, title: `Welcome call · ${fullName(u)} (USSD)`, kind: z.level === "red" ? "evacuate" : "warning", audience: "single", userIds: [u.id], auto: true, delaySec: 8 });
  }
  return {
    text: T[c.lang].regDone(u.first_name, ZONE_BY_ID[zoneId].name, langName(lang), hot),
    outcome: "registered",
    label: `Registered by USSD: ${ZONE_BY_ID[zoneId].name}, ${langName(lang)}${d.vul ? `, ${d.vul}` : ""}`,
    userId: u.id,
    zoneId,
    detail: { ...d, area: ZONE_BY_ID[zoneId].name, language: langName(lang), callQueued: hot },
  };
}

async function act(c: Ctx, st: State): Promise<Done> {
  switch (st.s) {
    case "do_safe": return doSafe(c, st.d);
    case "do_help": return doHelp(c, st.d);
    case "do_report": return doReport(c, st.d);
    case "risk": return doRisk(c, st.d);
    case "shelter": return doShelter(c, st.d);
    case "do_family_ping": return doFamilyPing(c, st.d);
    case "do_callback": return doCallback(c, st.d);
    case "do_register": return doRegister(c, st.d);
    case "numbers": return { text: T[c.lang].numbers, outcome: "numbers", label: "Asked for emergency numbers" };
    case "cancelled": return { text: T[c.lang].cancelled, outcome: "cancelled", label: "Cancelled registration" };
  }
  return { text: T[c.lang].ended, outcome: "ended", label: "Ended" };
}

const TERMINAL = new Set(["do_safe", "do_help", "do_report", "risk", "shelter", "do_family_ping", "do_callback", "do_register", "numbers", "cancelled"]);

const SCREEN_LABEL: Record<string, string> = {
  main: "Main menu", guest: "Welcome (unregistered)", safe_where: "I am safe: where?", help_type: "Help: type", help_people: "Help: how many people",
  help_vul: "Help: vulnerable person?", help_where: "Help: location", help_landmark: "Help: landmark", rep_kind: "Report: what", rep_where: "Report: where",
  rep_landmark: "Report: place", family: "Family status", callback: "Call-back", reg_name: "Register: name", reg_area: "Register: area", reg_lang: "Register: language",
  reg_vul: "Register: vulnerability", reg_consent: "Register: consent", g_risk_area: "Risk: choose area", g_help_area: "Help: choose area",
  call_menu: "Call answered · message played", call_end: "Call ended", q_where: "Follow-up: where are you", q_transport: "Follow-up: transport",
  q_people: "Follow-up: how many people", q_vulnerable: "Follow-up: vulnerable person", q_situation: "Follow-up: what is happening",
  do_safe: "Checked in", do_help: "Help request sent", do_report: "Hazard reported", risk: "Flood risk", shelter: "Nearest shelter", do_family_ping: "Family asked",
  do_callback: "Call-back requested", do_register: "Registered", numbers: "Emergency numbers", cancelled: "Cancelled",
};
export const screenLabel = (s: string) => SCREEN_LABEL[s] ?? s;

/** Handle one USSD request. Returns the gateway reply ("CON ..." / "END ..."). */
export async function handleUssd(o: {
  sessionId: string; serviceCode: string; phone: string; text: string; network?: string | null;
  origin: "simulator" | "gateway"; eventId: number; snap: Snapshot; flooded: (id: string) => boolean; originUrl: string;
}) {
  const user = await userByPhone(o.phone);
  if (o.origin === "simulator" && !simulatorMayUse(o.phone, user)) return "END This number cannot use the demo service.";
  if (user && user.role !== "user") return "END StormShield staff numbers cannot use the resident service.";

  const inputs = o.text === "" ? [] : o.text.split("*").map((x) => x.trim());
  let sess = await getSession(o.sessionId);
  if (sess?.ended_at) return `END ${sess.final_text ?? T.en.ended}`;
  const startLang: L = user?.language === "zu" ? "zu" : "en";
  if (!sess) {
    sess = await openSession({ eventId: o.eventId, channel: "ussd", sessionId: o.sessionId, phone: o.phone, userId: user?.id ?? null, serviceCode: o.serviceCode, network: o.network, origin: o.origin, lang: startLang, zoneId: user?.home_zone ?? null });
  }
  const c: Ctx = { eventId: o.eventId, snap: o.snap, flooded: o.flooded, phone: o.phone, user, lang: startLang, origin: o.origin, origin_url: o.originUrl };

  // Replay the inputs from the root menu.
  let st: State = { s: user ? "main" : "guest", d: {} };
  const stack: State[] = [];
  let invalid = false;
  for (const input of inputs) {
    invalid = false;
    if (input === "00") {
      st = { s: user ? "main" : "guest", d: { lang: c.lang } };
      stack.length = 0;
      continue;
    }
    if (input === "0" && !TEXT_STATES.has(st.s) && stack.length) {
      st = stack.pop()!;
      continue;
    }
    const nx = next(c, st, input);
    if (!nx) {
      invalid = true;
      continue;
    }
    if (nx.d.toggle) {
      c.lang = c.lang === "en" ? "zu" : "en";
      delete nx.d.toggle;
      st = nx;
      continue;
    }
    stack.push(st);
    st = nx;
    if (st.s === "family") st = await familyScreen(c, st);
    if (TERMINAL.has(st.s)) break;
  }

  const last = inputs.length ? inputs[inputs.length - 1] : null;
  if (TERMINAL.has(st.s)) {
    const done = await act(c, st);
    await logStep(sess, { in: last, out: done.text, end: true, screen: st.s }, {
      state: st.s, detail: { ...(done.detail ?? st.d) }, outcome: done.outcome, outcomeLabel: done.label, ticketId: done.ticketId ?? null,
      reportId: done.reportId ?? null, userId: done.userId ?? c.user?.id ?? null, lang: c.lang, zoneId: done.zoneId ?? null,
    });
    return `END ${done.text}`;
  }
  const screen = (invalid ? `${T[c.lang].invalid}\n` : "") + render(c, st);
  await logStep(sess, { in: last, out: screen, end: false, screen: st.s }, { state: st.s, detail: st.d, lang: c.lang });
  return `CON ${screen}`;
}
