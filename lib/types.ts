import type { Snapshot, ZoneState } from "./engine";
import type { Level } from "./risk";
import type { Hazard, LatLng } from "./geo";
import type { PublicUser } from "./users";

export interface EventInfo {
  id: number;
  mode: "drill" | "live";
  title: string;
  speed: number;
  hour: number | null;
  startedAt: string;
}

export interface PublicAlert {
  id: number;
  zoneId: string | null;
  level: Level;
  hazard: Hazard;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface ReportRow {
  id: number;
  kind: string;
  note: string | null;
  lat: number;
  lng: number;
  zone_id: string | null;
  created_at: string;
}

export interface StatusResponse {
  snap: Snapshot;
  event: EventInfo;
  alerts: PublicAlert[];
  reports: ReportRow[];
}

export interface MyAlert {
  id: number;
  zoneId: string | null;
  level: Level;
  hazard: Hazard;
  kind: string;
  createdAt: string;
  local: { title: string; body: string };
  english: { title: string; body: string };
}

export interface FamilyMember {
  id: number;
  name: string;
  relation: string;
  phone: string;
  isContact: boolean;
  linked: boolean;
  basicPhone?: boolean;
  status: string;
  statusAt: string | null;
  pingedAt: string | null;
  zone: ZoneState | null;
  token: string;
}

export interface MyTicket {
  id: number;
  ref: string;
  type: string;
  note: string | null;
  status: string;
  team: string | null;
  created_at: string;
  updated_at: string;
  people: number;
  source: string;
  p: LatLng;
  unit: { id: string; name: string | null; type: string | null; phone: string | null; base: LatLng; dispatchedAt: string | null; etaAt: string | null } | null;
}

export interface ActiveCall {
  id: number;
  status: "ringing" | "in_call";
  attempt: number;
  ringAt: string | null;
  kind: "warning" | "evacuate";
  title: string;
  insurer: string | null;
  script: { local: string; english: string };
  menu: { key: string; local: string; english: string }[];
}

export interface MyCall {
  id: number;
  status: string;
  attempts: number;
  key: string | null;
  result: string | null;
  title: string;
  updatedAt: string;
  tries: { target_id: number; attempt: number; started_at: string; outcome: string | null; key: string | null }[];
}

export interface MyClaim {
  id: number;
  ref: string;
  kind: string;
  description: string;
  status: string;
  validation: string;
  amount: number | null;
  assessor: string | null;
  created_at: string;
  updated_at: string;
}

export interface MyInsurance {
  insurerId: string;
  insurer: string | null;
  portal: boolean;
  policyNo: string | null;
  cover: string[];
  sumInsured: number | null;
  vehicle: string | null;
  consent: boolean;
  mitigatedAt: string | null;
  claims: MyClaim[];
}

export interface MyPlace {
  key: string;
  label: string;
  address: string;
  p: LatLng;
  zoneId: string | null;
  zone: ZoneState | null;
  zoneName: string | null;
}

export interface MeResponse {
  user: PublicUser;
  languageName: string;
  draftLanguage: boolean;
  checkinPrompt: { text: string; english: string };
  places: MyPlace[];
  checkin: { status: string; created_at: string } | null;
  checkinHistory: { status: string; created_at: string }[];
  alerts: MyAlert[];
  family: FamilyMember[];
  tickets: MyTicket[];
  messages: { id: number; channel: string; body: string; to_name: string; to_phone: string; created_at: string }[];
  activeCall: ActiveCall | null;
  calls: MyCall[];
  insurance: MyInsurance | null;
}

export interface SessionUser {
  id: number;
  role: "user" | "admin" | "insurer";
  firstName: string;
  surname: string;
  email: string;
  home: LatLng;
  language: string;
}
