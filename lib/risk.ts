import type { Hazard } from "./geo";

export type Level = "green" | "yellow" | "orange" | "red";
export const LEVEL_ORDER: Level[] = ["green", "yellow", "orange", "red"];
export const rank = (l: Level) => LEVEL_ORDER.indexOf(l);

export const LEVEL_META: Record<Level, { label: string; mapLabel: string; color: string; soft: string; text: string }> = {
  green: { label: "No concerns", mapLabel: "No weather concerns", color: "#22c55e", soft: "rgba(34,197,94,.14)", text: "#86efac" },
  yellow: { label: "Potential event", mapLabel: "Potential weather event", color: "#facc15", soft: "rgba(250,204,21,.14)", text: "#fde68a" },
  orange: { label: "High risk", mapLabel: "High-risk weather event", color: "#f97316", soft: "rgba(249,115,22,.16)", text: "#fdba74" },
  red: { label: "Extreme danger", mapLabel: "Extreme danger – act now", color: "#ef4444", soft: "rgba(239,68,68,.18)", text: "#fca5a5" },
};

export function levelOf(score: number): Level {
  if (score >= 75) return "red";
  if (score >= 50) return "orange";
  if (score >= 25) return "yellow";
  return "green";
}

export type Category = "SAFE" | "LOW RISK" | "MODERATE RISK" | "HIGH RISK" | "EXTREME RISK";
export function categoryOf(score: number): Category {
  if (score >= 75) return "EXTREME RISK";
  if (score >= 50) return "HIGH RISK";
  if (score >= 25) return "MODERATE RISK";
  if (score >= 12) return "LOW RISK";
  return "SAFE";
}

export const HAZARD_LABEL: Record<Hazard, string> = {
  flood: "Flood Warning",
  rain: "Heavy Rain",
  landslide: "Landslide Risk",
  wind: "Strong Winds",
  road: "Road Closure",
};

export const ACTIONS: Record<Level, { headline: string; steps: string[] }> = {
  green: {
    headline: "Stay informed",
    steps: ["Keep alerts switched on", "Check your emergency kit is packed", "Save your nearest shelter"],
  },
  yellow: {
    headline: "Prepare emergency kit",
    steps: ["Pack ID, medication, water and a torch", "Charge phones and power banks", "Clear drains and gutters around your home", "Agree a meeting point with family"],
  },
  orange: {
    headline: "Move vehicles and valuables to higher ground",
    steps: ["Move vehicles off low-lying streets", "Lift documents and electronics off the floor", "Pack your go-bag and be ready to leave", "Check on elderly and disabled neighbours"],
  },
  red: {
    headline: "Evacuate immediately",
    steps: ["Leave now for the nearest open shelter", "Never walk or drive through moving water", "Switch off electricity at the mains if safe", "Check in so responders know you are safe"],
  },
};

export type CheckStatus = "safe" | "evacuating" | "need_help" | "vulnerable_present";
export const CHECK_META: Record<CheckStatus, { label: string; color: string }> = {
  safe: { label: "I am safe", color: "#22c55e" },
  evacuating: { label: "Preparing to evacuate", color: "#facc15" },
  need_help: { label: "Need assistance", color: "#ef4444" },
  vulnerable_present: { label: "Vulnerable person present", color: "#a78bfa" },
};

export const TICKET_TYPES = {
  medical: "Medical emergency",
  rescue: "Rescue required",
  flooded: "Flooded property",
  stranded: "Stranded",
  assistance: "Needs assistance (check-in)",
  transport: "Help to evacuate",
  welfare: "Welfare check (unreached)",
  other: "Other",
} as const;
export type TicketType = keyof typeof TICKET_TYPES;
export const TICKET_FLOW = ["received", "en_route", "on_scene", "resolved"] as const;
export type TicketStatus = (typeof TICKET_FLOW)[number];
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  received: "Received",
  en_route: "Responders on the way",
  on_scene: "On scene",
  resolved: "Resolved",
};

export const TICKET_SOURCE_LABEL: Record<string, string> = {
  app: "App",
  panic: "Panic button",
  checkin: "App check-in",
  call: "Call keypad",
  escalation: "Unreached (auto)",
  staff: "Staff",
  ussd: "USSD *120*7867#",
};
export const PRIORITY_COLOR: Record<string, string> = { urgent: "#ef4444", high: "#f97316", normal: "#8b9db0" };

export const VULNERABLE_OPTIONS = [
  { id: "elderly", label: "Elderly" },
  { id: "disabled", label: "Disabled" },
  { id: "wheelchair", label: "Wheelchair user" },
  { id: "chronic", label: "Chronic illness" },
  { id: "pregnant", label: "Pregnant" },
] as const;

export const REPORT_KINDS = {
  flooded_road: "Flooded road",
  rising_water: "Rising water",
  blocked_drain: "Blocked drain",
  landslide: "Landslide / mud",
  power_out: "Power outage",
  water_out: "No water supply",
} as const;
export type ReportKind = keyof typeof REPORT_KINDS;
