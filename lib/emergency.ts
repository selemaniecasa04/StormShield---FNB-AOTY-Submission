// Emergency numbers appended to every SMS StormShield sends (pure: used by server and browser).
export const EMERGENCY_LINES = [
  { label: "Emergency (any phone, free)", short: "Emergency", number: "112" },
  { label: "Ambulance", short: "Ambulance", number: "10177" },
  { label: "Police (SAPS)", short: "Police", number: "10111" },
  { label: "eThekwini Disaster Management & Fire", short: "eThekwini Disaster/Fire", number: "031 361 0000" },
] as const;

export const USSD_CODE = "*120*7867#";

/** The footer as it appears at the bottom of each SMS. */
export const SMS_FOOTER = `EMERGENCY: ${EMERGENCY_LINES.map((l) => `${l.short} ${l.number}`).join(" | ")}. No data? Dial ${USSD_CODE}`;

export function withEmergencyFooter(body: string) {
  return body.includes("EMERGENCY:") ? body : `${body}\n\n${SMS_FOOTER}`;
}
