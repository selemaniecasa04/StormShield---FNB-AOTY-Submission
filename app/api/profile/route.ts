import { q, one } from "@/lib/db";
import { checkPassword, endSession, requireUser } from "@/lib/auth";
import { body, handle, json, normPhone, num, str } from "@/lib/http";
import { getUser, publicUser } from "@/lib/users";
import { isLang } from "@/lib/i18n";
import { VULNERABLE_OPTIONS } from "@/lib/risk";
import { zoneAt } from "@/lib/geo";
import { COVER, INSURERS } from "@/lib/insurance";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireUser();
  return json({ user: publicUser(await getUser(s.uid)) });
});

export const PATCH = handle(async (req: Request) => {
  const s = await requireUser();
  const u = await getUser(s.uid);
  const b = await body(req);
  const errors: Record<string, string> = {};
  const first = str(b.firstName, 60) || u.first_name;
  const last = str(b.surname, 60) || u.surname;
  const phone = b.phone !== undefined ? normPhone(b.phone) : u.phone;
  if (!phone) errors.phone = "Enter a valid phone number.";
  const language = b.language !== undefined ? (isLang(b.language) ? b.language : null) : u.language;
  if (!language) errors.language = "Choose a language.";
  const ecName = b.emergencyName !== undefined ? str(b.emergencyName, 80) : u.emergency_name;
  if (!ecName) errors.emergencyName = "Emergency contact name is required.";
  const ecPhone = b.emergencyPhone !== undefined ? normPhone(b.emergencyPhone) : u.emergency_phone;
  if (!ecPhone) errors.emergencyPhone = "Enter a valid number.";
  const medical = b.medical !== undefined ? str(b.medical, 300) || null : u.medical;
  const vulnerable = Array.isArray(b.vulnerable) ? VULNERABLE_OPTIONS.map((o) => o.id).filter((id) => (b.vulnerable as unknown[]).includes(id)).join(",") : u.vulnerable;

  let homeAddress = u.home_address, homeLat = u.home_lat, homeLng = u.home_lng;
  if (b.homeAddress !== undefined) {
    homeAddress = str(b.homeAddress, 200);
    const la = num(b.homeLat), ln = num(b.homeLng);
    if (!homeAddress || la === null || ln === null) errors.homeAddress = "Choose your home from the search or map.";
    else { homeLat = la; homeLng = ln; }
  }
  let workAddress = u.work_address, workLat = u.work_lat, workLng = u.work_lng;
  if (b.workAddress !== undefined) {
    workAddress = str(b.workAddress, 200) || null;
    if (!workAddress) { workLat = null; workLng = null; }
    else {
      const la = num(b.workLat), ln = num(b.workLng);
      if (la === null || ln === null) errors.workAddress = "Choose your work address from the search or map.";
      else { workLat = la; workLng = ln; }
    }
  }
  let insurerId = u.insurer_id, policyNo = u.policy_no, cover = u.cover, vehicle = u.vehicle_desc, insurerConsent = u.insurer_consent;
  if (b.insurerId !== undefined) {
    insurerId = str(b.insurerId, 20) || null;
    if (insurerId && !INSURERS.some((i) => i.id === insurerId)) errors.insurerId = "Choose an insurer from the list.";
    policyNo = insurerId ? str(b.policyNo, 40) || null : null;
    if (insurerId && !policyNo) errors.policyNo = "Enter your policy number.";
    const c = Array.isArray(b.cover) ? Object.keys(COVER).filter((k) => (b.cover as unknown[]).includes(k)) : [];
    if (insurerId && !c.length) errors.cover = "Choose what your policy covers.";
    cover = insurerId ? c.join(",") : "";
    vehicle = insurerId && c.includes("vehicle") ? str(b.vehicle, 60) || null : null;
    insurerConsent = !!insurerId && b.insurerConsent === true;
  }
  if (phone && phone !== u.phone) {
    const dup = await one(`SELECT id FROM users WHERE phone = $1 AND id <> $2`, [phone, u.id]);
    if (dup) errors.phone = "Another account uses this number.";
  }
  if (Object.keys(errors).length) return json({ error: "Please fix the highlighted fields.", errors }, 400);

  await q(
    `UPDATE users SET first_name=$2, surname=$3, phone=$4, language=$5, emergency_name=$6, emergency_phone=$7, medical=$8, vulnerable=$9,
      home_address=$10, home_lat=$11, home_lng=$12, home_zone=$13, work_address=$14, work_lat=$15, work_lng=$16, work_zone=$17,
      insurer_id=$18, policy_no=$19, cover=$20, vehicle_desc=$21, insurer_consent=$22 WHERE id=$1`,
    [u.id, first, last, phone, language, ecName, ecPhone, medical, vulnerable, homeAddress, homeLat, homeLng, zoneAt([homeLat, homeLng])?.id ?? null,
      workAddress, workLat, workLng, workLat !== null && workLng !== null ? zoneAt([workLat, workLng])?.id ?? null : null,
      insurerId, policyNo, cover, vehicle, insurerConsent],
  );
  return json({ ok: true });
});

/** POPIA: residents can delete their account and all personal data. */
export const DELETE = handle(async (req: Request) => {
  const s = await requireUser();
  const u = await getUser(s.uid);
  const b = await body(req);
  if (u.demo) return json({ error: "Demo accounts can't be deleted. Register your own account to try this." }, 400);
  if (typeof b.password !== "string" || !(await checkPassword(b.password, u.password_hash))) return json({ error: "Password is incorrect." }, 401);
  await q(`UPDATE reports SET user_id = NULL WHERE user_id = $1`, [u.id]);
  await q(`DELETE FROM users WHERE id = $1`, [u.id]);
  await endSession();
  return json({ ok: true });
});
