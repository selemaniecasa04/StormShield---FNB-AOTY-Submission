import "server-only";
import { one } from "./db";
import { HttpError } from "./auth";

export interface UserRow {
  id: number;
  first_name: string;
  surname: string;
  phone: string;
  email: string;
  password_hash: string;
  role: "user" | "admin" | "insurer";
  home_address: string;
  home_lat: number;
  home_lng: number;
  home_zone: string | null;
  work_address: string | null;
  work_lat: number | null;
  work_lng: number | null;
  work_zone: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_at: string | null;
  language: string;
  emergency_name: string;
  emergency_phone: string;
  medical: string | null;
  vulnerable: string;
  demo: boolean;
  sim: boolean;
  org: string | null;
  insurer_id: string | null;
  policy_no: string | null;
  cover: string;
  sum_insured: number | null;
  vehicle_desc: string | null;
  insurer_consent: boolean;
  mitigated_at: string | null;
  channel: string;
  created_at: string;
}

export async function getUser(id: number) {
  const u = await one<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!u) throw new HttpError(401, "Account not found.");
  return u;
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    firstName: u.first_name,
    surname: u.surname,
    phone: u.phone,
    email: u.email,
    role: u.role,
    homeAddress: u.home_address,
    home: [u.home_lat, u.home_lng] as [number, number],
    homeZone: u.home_zone,
    workAddress: u.work_address,
    work: u.work_lat != null && u.work_lng != null ? ([u.work_lat, u.work_lng] as [number, number]) : null,
    workZone: u.work_zone,
    gps: u.gps_lat != null && u.gps_lng != null ? ([u.gps_lat, u.gps_lng] as [number, number]) : null,
    gpsAt: u.gps_at,
    language: u.language,
    emergencyName: u.emergency_name,
    emergencyPhone: u.emergency_phone,
    medical: u.medical,
    vulnerable: u.vulnerable ? u.vulnerable.split(",").filter(Boolean) : [],
    demo: u.demo,
    org: u.org,
    insurerId: u.insurer_id,
    policyNo: u.policy_no,
    cover: u.cover ? u.cover.split(",").filter(Boolean) : [],
    sumInsured: u.sum_insured,
    vehicle: u.vehicle_desc,
    insurerConsent: u.insurer_consent,
  };
}
export type PublicUser = ReturnType<typeof publicUser>;

export { ticketRef } from "./ids";
