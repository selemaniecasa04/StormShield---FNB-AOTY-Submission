// Call outreach: timings, keypad menu and call script (pure: used by server and browser).
import { alertText } from "./i18n";
import type { Hazard } from "./geo";

/** Demo timings are compressed so a full 3-call cycle fits in about 2 minutes. */
export const OUTREACH = {
  maxAttempts: 3,
  ringSec: 20,
  answerWindowSec: 60,
  gapsSec: [30, 60], // wait before call 2 and call 3
  production: { ringSec: 30, gapsMin: [5, 10] },
};

export type OutreachKind = "warning" | "evacuate";
export type Key = "1" | "2" | "3" | "4" | "5";

const MENU: Record<string, [string, string, string, string, string]> = {
  en: ["I am safe / prepared", "Preparing or evacuating now", "I need help to evacuate", "Emergency: in danger now", "Repeat in English"],
  zu: ["Ngiphephile", "Ngiyalungiselela / ngiyasuka", "Ngidinga usizo lokusuka", "Isimo esiphuthumayo manje", "Phinda ngesiNgisi"],
  xh: ["Ndikhuselekile", "Ndiyalungiselela / ndiyemka", "Ndifuna uncedo lokufuduka", "Ingxakeko ngoku", "Phinda ngesiNgesi"],
  af: ["Ek is veilig", "Ek berei voor / ontruim", "Ek het hulp nodig om te ontruim", "Noodgeval nou", "Herhaal in Engels"],
  st: ["Ke bolokehile", "Ke a itokisa / ke a tloha", "Ke hloka thuso ho tloha", "Tshohanyetso hona jwale", "Pheta ka Sekgowa"],
  tn: ["Ke babalesegile", "Ke a ipaakanya / ke a tsamaya", "Ke tlhoka thuso go tswa", "Tshoganyetso jaanong", "Boeletsa ka Seesimane"],
  ts: ["Ndzi hlayisekile", "Ndza lunghiselela / ndza suka", "Ndzi lava mpfuno ku suka", "Xihatla sweswi", "Phindha hi Xinghezi"],
  ve: ["Ndo tsireledzea", "Ndi khou ḓilugisela / ndi a bva", "Ndi ṱoḓa thuso u bva", "Tshoganetso zwino", "Dovholola nga Luisimane"],
  nso: ["Ke bolokegile", "Ke a itokišetša / ke a tloga", "Ke nyaka thušo go tloga", "Tšhoganetšo bjale", "Boeletša ka Seisimane"],
  ss: ["Ngiphephile", "Ngiyalungiselela / ngiyasuka", "Ngidzinga lusito kute ngisuke", "Simo lesiphutfumako nyalo", "Phindza ngesiNgisi"],
  nr: ["Ngiphephile", "Ngiyalungiselela / ngiyasuka", "Ngitlhoga isizo lokusuka", "Isehlakalo esirhabako nje", "Phinda ngesiNgisi"],
};

export const KEY_INFO: Record<Key, { result: string; effect: string; color: string }> = {
  "1": { result: "safe", effect: "Marked safe for family and responders", color: "#22c55e" },
  "2": { result: "preparing", effect: "Marked evacuating; SMS with nearest open shelter and route", color: "#facc15" },
  "3": { result: "needs_help", effect: "Help-to-evacuate request created (transport)", color: "#f97316" },
  "4": { result: "emergency", effect: "Urgent rescue request; operator alerted", color: "#ef4444" },
  "5": { result: "repeat", effect: "Message repeated in English", color: "#8b9db0" },
};

export const RESULT_LABEL: Record<string, string> = {
  safe: "Safe / prepared (1)",
  preparing: "Preparing / evacuating (2)",
  needs_help: "Needs help to evacuate (3)",
  emergency: "Emergency (4)",
  manual: "Reached by staff",
  app_checkin: "Checked in on the app",
  ussd_checkin: "Checked in by USSD",
  ussd_help: "Asked for help by USSD",
};

export function menu(lang: string, insured = false) {
  const local = MENU[lang] ?? MENU.en;
  const en = MENU.en;
  return (["1", "2", "3", "4", "5"] as Key[]).map((k, i) => ({
    key: k,
    local: local[i],
    english: k === "2" && insured ? "Preparing / I've moved my vehicle and valuables" : en[i],
  }));
}

/** The spoken call script, in the person's language and in English. */
export function script(o: { lang: string; kind: OutreachKind; area: string; hazard: Hazard; custom?: string | null; insurer?: string | null }) {
  const level = o.kind === "evacuate" ? "red" : "orange";
  const local = alertText(o.lang, o.hazard, level, o.area, { custom: o.custom });
  const en = alertText("en", o.hazard, level, o.area, { custom: o.custom });
  const who = o.insurer ? `${o.insurer} and StormShield` : "StormShield";
  return {
    local: `${local.title}. ${local.body}`,
    english: `This is an automated call from ${who}. ${en.title}. ${en.body} Press 1 if you are safe, 2 if you are preparing or leaving, 3 if you need help to evacuate, 4 if you are in danger now, or 5 to hear this again in English.`,
  };
}
