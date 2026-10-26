// Insurance partner model (mock insurer for the demo).
export const INSURERS = [
  { id: "shieldsure", name: "ShieldSure Insurance", portal: true },
  { id: "other", name: "Another insurer", portal: false },
] as const;
export type InsurerId = (typeof INSURERS)[number]["id"];
export const insurerName = (id: string | null | undefined) => INSURERS.find((i) => i.id === id)?.name ?? null;
export const hasPortal = (id: string | null | undefined) => !!INSURERS.find((i) => i.id === id && i.portal);

export const COVER = {
  building: "Home building",
  contents: "Home contents",
  vehicle: "Vehicle",
} as const;
export type Cover = keyof typeof COVER;

// Assumptions used for the "losses avoided" estimate (shown on the insurer screen).
export const AVG_VEHICLE_FLOOD_CLAIM = 85_000;
export const AVG_CONTENTS_FLOOD_CLAIM = 45_000;

export const CLAIM_FLOW = ["received", "assessor", "approved", "settled"] as const;
export const CLAIM_STATUS_LABEL: Record<string, string> = {
  received: "Received",
  assessor: "Assessor assigned",
  approved: "Approved",
  settled: "Paid out",
  rejected: "Declined",
};

export const claimRef = (id: number) => `CLM-${2400 + id}`;

export function rand(n: number) {
  return `R ${Math.round(n).toLocaleString("en-ZA").replace(/,/g, " ")}`;
}

export function randShort(n: number) {
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} m`;
  if (n >= 1_000) return `R ${Math.round(n / 1000)} k`;
  return `R ${n}`;
}
