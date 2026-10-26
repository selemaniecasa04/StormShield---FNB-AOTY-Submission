// Voice-call keypad flow on a basic phone: after the main keypad answer (1-4) the caller is asked
// one or two short follow-up questions so the command centre gets more detail.
import "server-only";
import { q, one } from "./db";
import { getTarget, respond } from "./outreach";
import { KEY_INFO, RESULT_LABEL, type Key } from "./outreach-text";
import { ticketRef } from "./ids";
import { getSession, logStep, notifyFamily, openSession, type SessionRow } from "./phone";
import type { UserRow } from "./users";

interface Question {
  id: "where" | "transport" | "people" | "vulnerable" | "situation";
  en: string;
  zu: string;
  options?: Record<string, string>;
}

const Q: Record<Question["id"], Question> = {
  where: { id: "where", en: "Where are you now? Press 1 at home, 2 at a shelter, 3 with family or friends.", zu: "Ukuphi manje? Cindezela 1 ekhaya, 2 endaweni yokukhosela, 3 nomndeni noma abangane.", options: { "1": "At home", "2": "At a shelter", "3": "With family or friends" } },
  transport: { id: "transport", en: "Do you have transport to leave? Press 1 for yes, 2 if you need transport.", zu: "Unazo izinto zokuhamba? Cindezela 1 yebo, 2 uma udinga ukuthuthwa.", options: { "1": "Has own transport", "2": "Needs transport" } },
  people: { id: "people", en: "How many people are with you? Press a number from 1 to 9.", zu: "Bangaki abantu abanawe? Cindezela inombolo kusuka ku-1 kuya ku-9." },
  vulnerable: { id: "vulnerable", en: "Is anyone elderly, disabled, ill or pregnant? Press 1 for yes, 2 for no.", zu: "Ingabe kukhona osekhulile, okhubazekile, ogulayo noma okhulelwe? Cindezela 1 yebo, 2 cha.", options: { "1": "Yes", "2": "No" } },
  situation: { id: "situation", en: "What is happening? Press 1 water inside the home, 2 trapped or cut off, 3 someone is injured or ill, 4 other.", zu: "Kwenzekani? Cindezela 1 amanzi endlini, 2 nivaleleke, 3 kukhona olimele noma ogulayo, 4 okunye.", options: { "1": "Water inside the home", "2": "Trapped or cut off", "3": "Injured or ill", "4": "Other emergency" } },
};

const FOLLOWUPS: Record<Exclude<Key, "5">, Question["id"][]> = {
  "1": ["where"],
  "2": ["transport"],
  "3": ["people", "vulnerable"],
  "4": ["situation", "people"],
};

export interface IvrScreen {
  stage: "menu" | "question" | "done";
  sessionId: string;
  question?: { id: string; text: string; english: string; options: { key: string; label: string }[] | null };
  ticket?: string | null;
  key?: Key;
  effect?: string;
  goodbye?: string;
}

const sid = (targetId: number, attempt: number) => `ivr-${targetId}-${attempt}`;

function asQuestion(id: Question["id"], lang: string) {
  const x = Q[id];
  return { id, text: lang === "zu" ? x.zu : x.en, english: x.en, options: x.options ? Object.entries(x.options).map(([key, label]) => ({ key, label })) : null };
}

async function session(u: UserRow, targetId: number, attempt: number, eventId: number) {
  return (await getSession(sid(targetId, attempt))) ?? openSession({ eventId, channel: "ivr", sessionId: sid(targetId, attempt), phone: u.phone, userId: u.id, targetId, origin: "simulator", lang: u.language, zoneId: u.home_zone, serviceCode: "Voice call" });
}

/** Handle an action on the incoming StormShield call from the feature phone. */
export async function ivrAction(o: {
  u: UserRow; targetId: number; action: "answer" | "decline" | "key" | "answer_q" | "hangup"; key?: string; script?: { local: string; english: string };
  flooded: (id: string) => boolean;
}): Promise<IvrScreen | { error: string; status: number }> {
  const t = await getTarget(q, o.targetId);
  if (!t || t.user_id !== o.u.id) return { error: "Call not found.", status: 404 };
  const s = await session(o.u, t.id, Math.max(1, t.attempts), t.event_id);
  const detail = JSON.parse(s.detail || "{}") as Record<string, unknown>;

  if (o.action === "answer") {
    if (t.status !== "ringing") return { error: "This call has ended.", status: 409 };
    await respond(q, t, "answer", null, o.flooded);
    await logStep(s, { in: "ANSWER", out: o.script ? `${o.script.local}\n— ${o.script.english}` : "Call answered", end: false, screen: "call_menu" }, { state: "call_menu", detail: { ...detail, attempt: t.attempts } });
    return { stage: "menu", sessionId: s.session_id };
  }

  if (o.action === "decline" || (o.action === "hangup" && ["ringing", "in_call"].includes(t.status))) {
    if (["ringing", "in_call"].includes(t.status)) await respond(q, t, "decline", null, o.flooded);
    await logStep(s, { in: o.action === "decline" ? "DECLINE" : "HANG UP", out: `Call ${t.attempts} of 3 not completed. StormShield will SMS and call again.`, end: true, screen: "call_end" }, { outcome: "declined", outcomeLabel: `Call ${t.attempts} ${o.action === "decline" ? "declined" : "hung up before answering"}`, detail: { ...detail, attempt: t.attempts } });
    return { stage: "done", sessionId: s.session_id, goodbye: "Call ended." };
  }

  if (o.action === "hangup") {
    // Hung up during the follow-up questions: keep what we have.
    if (!s.ended_at) await logStep(s, { in: "HANG UP", out: "Caller hung up during follow-up questions.", end: true, screen: "call_end" }, { detail });
    return { stage: "done", sessionId: s.session_id, goodbye: "Call ended." };
  }

  if (o.action === "key") {
    const key = String(o.key ?? "") as Key;
    if (!["1", "2", "3", "4", "5"].includes(key)) return { error: "Invalid key.", status: 400 };
    if (t.status !== "in_call") return { error: "This call has ended.", status: 409 };
    if (key === "5") {
      await logStep(s, { in: "5", out: o.script?.english ?? "Repeated in English", end: false, screen: "call_menu" });
      return { stage: "menu", sessionId: s.session_id };
    }
    const r = await respond(q, t, "key", key, o.flooded);
    const ticketId = r.ticket ? Number(r.ticket.replace("SS-", "")) - 1000 : null;
    const qs = FOLLOWUPS[key];
    const first = asQuestion(qs[0], o.u.language);
    await logStep(
      s,
      { in: key, out: `${KEY_INFO[key].effect}.\n${first.text}`, end: false, screen: `q_${qs[0]}` },
      { state: `q_${qs[0]}`, detail: { ...detail, key, result: RESULT_LABEL[KEY_INFO[key].result] ?? KEY_INFO[key].result, pending: qs.join(","), ticket: r.ticket }, outcome: `call_key_${key}`, outcomeLabel: `Voice call: pressed ${key} (${RESULT_LABEL[KEY_INFO[key].result] ?? ""})`, ticketId },
    );
    if (key === "3" || key === "4") {
      await notifyFamily(t.event_id, o.u, "need_help", `StormShield: ${o.u.first_name} ${o.u.surname} pressed ${key} on our flood call (${key === "4" ? "in danger now" : "needs help to evacuate"}). Ref ${r.ticket}. Responders have been alerted.`);
    } else {
      await notifyFamily(t.event_id, o.u, key === "1" ? "safe" : "evacuating", `StormShield: ${o.u.first_name} ${o.u.surname} answered our flood call: ${key === "1" ? "SAFE" : "preparing / leaving for safety"}.`);
    }
    return { stage: "question", sessionId: s.session_id, question: first, ticket: r.ticket, key, effect: KEY_INFO[key].effect };
  }

  // answer_q: a follow-up answer.
  const pending = String(detail.pending ?? "").split(",").filter(Boolean) as Question["id"][];
  if (s.ended_at || !pending.length) return { stage: "done", sessionId: s.session_id, goodbye: "Call ended." };
  const qid = pending[0];
  const qq = Q[qid];
  const a = String(o.key ?? "");
  const valid = qq.options ? a in qq.options : /^[1-9]$/.test(a);
  if (!valid) {
    const again = asQuestion(qid, o.u.language);
    await logStep(s, { in: a, out: `Invalid key. ${again.text}`, end: false, screen: `q_${qid}` });
    return { stage: "question", sessionId: s.session_id, question: again };
  }
  const label = qq.options ? qq.options[a] : `${a} ${a === "1" ? "person" : "people"}`;
  const ticketId = s.ticket_id;
  const tag = `Voice call follow-up: ${qid} = ${label}`;
  if (qid === "where") {
    await q(`UPDATE checkins SET note = coalesce(note, '') || $3 WHERE id = (SELECT id FROM checkins WHERE event_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1)`, [t.event_id, o.u.id, ` · ${label}`]);
  } else if (qid === "transport" && a === "2") {
    const open = await one<{ id: number }>(`SELECT id FROM tickets WHERE event_id = $1 AND user_id = $2 AND status <> 'resolved' ORDER BY id DESC LIMIT 1`, [t.event_id, o.u.id]);
    const p: [number, number] = o.u.gps_lat != null && o.u.gps_lng != null ? [o.u.gps_lat, o.u.gps_lng] : [o.u.home_lat, o.u.home_lng];
    const id = open?.id ?? (await q<{ id: number }>(
      `INSERT INTO tickets (event_id, user_id, type, note, lat, lng, priority, source) VALUES ($1,$2,'transport',$3,$4,$5,$6,'call') RETURNING id`,
      [t.event_id, o.u.id, "Pressed 2 (evacuating) and then said they need transport", p[0], p[1], o.u.vulnerable ? "high" : "normal"],
    ))[0].id;
    detail.ticket = ticketRef(id);
    await q(`UPDATE phone_sessions SET ticket_id = $2 WHERE id = $1`, [s.id, id]);
    await q(`UPDATE outreach_targets SET ticket_id = $2 WHERE id = $1`, [t.id, id]);
  } else if (ticketId && qid === "people") {
    await q(`UPDATE tickets SET people = $2, note = coalesce(note, '') || $3, updated_at = now() WHERE id = $1`, [ticketId, Number(a), ` [${tag}]`]);
  } else if (ticketId && qid === "vulnerable") {
    await q(`UPDATE tickets SET priority = CASE WHEN priority = 'urgent' THEN 'urgent' WHEN $2 THEN 'high' ELSE priority END, note = coalesce(note, '') || $3, updated_at = now() WHERE id = $1`, [ticketId, a === "1", ` [${tag}]`]);
  } else if (ticketId && qid === "situation") {
    const type = { "1": "flooded", "2": "rescue", "3": "medical", "4": "rescue" }[a]!;
    await q(`UPDATE tickets SET type = $2, note = coalesce(note, '') || $3, updated_at = now() WHERE id = $1`, [ticketId, type, ` [${tag}]`]);
  }
  const rest = pending.slice(1);
  const answers = { ...((detail.answers as Record<string, string>) ?? {}), [qid]: label };
  const nd: Record<string, unknown> = { ...detail, pending: rest.join(","), answers };
  if (rest.length) {
    const nq = asQuestion(rest[0], o.u.language);
    await logStep(s, { in: a, out: nq.text, end: false, screen: `q_${rest[0]}` }, { state: `q_${rest[0]}`, detail: nd });
    return { stage: "question", sessionId: s.session_id, question: nq };
  }
  const bye = o.u.language === "zu" ? "Siyabonga. Izimpendulo zakho zithunyelwe ethimbeni lezinhlekelele. Hamba kahle." : "Thank you. Your answers have been sent to the disaster management team. Goodbye.";
  await logStep(s, { in: a, out: bye, end: true, screen: "call_end" }, { state: "call_end", detail: nd });
  return { stage: "done", sessionId: s.session_id, goodbye: bye, ticket: (nd.ticket as string) ?? null };
}

export type { SessionRow };
