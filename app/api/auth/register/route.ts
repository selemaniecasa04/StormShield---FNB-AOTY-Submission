import { one, q } from "@/lib/db";
import { HttpError, hashPassword, startSession } from "@/lib/auth";
import { body, handle, json, limit, normPhone, num, str } from "@/lib/http";
import { isLang } from "@/lib/i18n";
import { VULNERABLE_OPTIONS } from "@/lib/risk";
import { zoneAt } from "@/lib/geo";
import { COVER, INSURERS } from "@/lib/insurance";
import { getSnapshot } from "@/lib/status";
import { createCampaign } from "@/lib/outreach";
import { rank } from "@/lib/risk";

export const POST = handle(async (req: Request) => {
  limit(req, "register", 8, 60_000);
  const b = await body(req);
  const first = str(b.firstName, 60);
  const last = str(b.surname, 60);
  const email = str(b.email, 120).toLowerCase();
  const phone = normPhone(b.phone);
  const password = typeof b.password === "string" ? b.password : "";
  const confirm = typeof b.confirmPassword === "string" ? b.confirmPassword : "";
  const homeAddress = str(b.homeAddress, 200);
  const homeLat = num(b.homeLat);
  const homeLng = num(b.homeLng);
  const workAddress = str(b.workAddress, 200) || null;
  const workLat = workAddress ? num(b.workLat) : null;
  const workLng = workAddress ? num(b.workLng) : null;
  const gpsLat = num(b.gpsLat);
  const gpsLng = num(b.gpsLng);
  const language = isLang(b.language) ? b.language : null;
  const ecName = str(b.emergencyName, 80);
  const ecPhone = normPhone(b.emergencyPhone);
  const medical = str(b.medical, 300) || null;
  const vulIn = Array.isArray(b.vulnerable) ? b.vulnerable : [];
  const vulnerable = VULNERABLE_OPTIONS.map((o) => o.id).filter((id) => vulIn.includes(id));
  const consent = b.consent === true;
  const insurerId = str(b.insurerId, 20) || null;
  const policyNo = str(b.policyNo, 40) || null;
  const coverIn = Array.isArray(b.cover) ? b.cover : [];
  const cover = Object.keys(COVER).filter((c) => coverIn.includes(c));
  const vehicleDesc = str(b.vehicle, 60) || null;
  const insurerConsent = b.insurerConsent === true;

  const errors: Record<string, string> = {};
  if (!first) errors.firstName = "First name is required.";
  if (!last) errors.surname = "Surname is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!phone) errors.phone = "Enter a valid phone number, e.g. 082 123 4567.";
  if (password.length < 8 || !/[0-9]/.test(password) || !/[A-Za-z]/.test(password)) errors.password = "Use at least 8 characters with letters and numbers.";
  if (password !== confirm) errors.confirmPassword = "Passwords do not match.";
  if (!homeAddress) errors.homeAddress = "Home address is required.";
  if (homeLat === null || homeLng === null || Math.abs(homeLat) > 90 || Math.abs(homeLng) > 180) errors.homeAddress = "Pick your home on the map or choose a search result.";
  if (workAddress && (workLat === null || workLng === null)) errors.workAddress = "Choose a work address from the search results or clear it.";
  if (!language) errors.language = "Choose a language.";
  if (!ecName) errors.emergencyName = "Emergency contact name is required.";
  if (!ecPhone) errors.emergencyPhone = "Enter a valid emergency contact number.";
  if (ecPhone && phone && ecPhone === phone) errors.emergencyPhone = "Use someone else's number.";
  if (!consent) errors.consent = "Please accept the privacy notice to continue.";
  if (insurerId && !INSURERS.some((i) => i.id === insurerId)) errors.insurerId = "Choose an insurer from the list.";
  if (insurerId && !policyNo) errors.policyNo = "Enter your policy number.";
  if (insurerId && !cover.length) errors.cover = "Choose what your policy covers.";
  if (Object.keys(errors).length) return json({ error: "Please fix the highlighted fields.", errors }, 400);

  const dup = await one<{ email: string; phone: string }>(`SELECT email, phone FROM users WHERE email = $1 OR phone = $2`, [email, phone]);
  if (dup) {
    const errs: Record<string, string> = {};
    if (dup.email === email) errs.email = "An account with this email already exists.";
    if (dup.phone === phone) errs.phone = "An account with this phone number already exists.";
    return json({ error: "Account already exists. Try signing in.", errors: errs }, 409);
  }

  const hash = await hashPassword(password);
  const homeZone = zoneAt([homeLat!, homeLng!])?.id ?? null;
  const workZone = workLat !== null && workLng !== null ? zoneAt([workLat, workLng])?.id ?? null : null;
  const rows = await q<{ id: number }>(
    `INSERT INTO users (first_name, surname, phone, email, password_hash, home_address, home_lat, home_lng, home_zone,
      work_address, work_lat, work_lng, work_zone, gps_lat, gps_lng, gps_at, language, emergency_name, emergency_phone, medical, vulnerable,
      insurer_id, policy_no, cover, vehicle_desc, insurer_consent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, CASE WHEN $14::float8 IS NULL THEN NULL ELSE now() END,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING id`,
    [first, last, phone, email, hash, homeAddress, homeLat, homeLng, homeZone, workAddress, workLat, workLng, workZone, gpsLat, gpsLng, language, ecName, ecPhone, medical, vulnerable.join(","),
      insurerId, insurerId ? policyNo : null, insurerId ? cover.join(",") : "", insurerId && cover.includes("vehicle") ? vehicleDesc : null, !!insurerId && insurerConsent],
  );
  const id = rows[0].id;
  // Emergency contact becomes the first member of the family circle.
  const linked = await one<{ id: number }>(`SELECT id FROM users WHERE phone = $1`, [ecPhone]);
  await q(`INSERT INTO family (user_id, name, relation, phone, is_contact, linked_user_id, token) VALUES ($1,$2,'Emergency contact',$3,true,$4,$5)`, [
    id, ecName, ecPhone, linked?.id ?? null, crypto.randomUUID().replace(/-/g, ""),
  ]);
  if (!id) throw new HttpError(500, "Could not create account.");
  // Already in a danger zone? StormShield calls straight away.
  const { snap, event } = await getSnapshot();
  const zs = [homeZone, workZone].map((z) => snap.zones.find((x) => x.id === z)).filter(Boolean);
  const worst = zs.sort((a, b) => b!.score - a!.score)[0];
  if (worst && rank(worst.level) >= 2) {
    await createCampaign(q, { eventId: event.id, title: `New resident in ${worst.name}`, kind: worst.level === "red" ? "evacuate" : "warning", audience: "single", userIds: [id], delaySec: 8 });
  }
  await startSession({ uid: id, role: "user", name: first });
  return json({ ok: true, redirect: "/dashboard" });
});
