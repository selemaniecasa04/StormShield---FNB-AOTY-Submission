import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { currentEvent } from "@/lib/status";
import { getUser } from "@/lib/users";

/** Resident confirms they have moved vehicles and valuables to safety (shared with their insurer). */
export const POST = handle(async () => {
  const s = await requireUser();
  const u = await getUser(s.uid);
  if (!u.insurer_id) return json({ error: "No insurance linked to your account." }, 400);
  await q(`UPDATE users SET mitigated_at = now() WHERE id = $1`, [u.id]);
  const ev = await currentEvent();
  await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'push',$5)`, [
    ev.id, u.id, `${u.first_name} ${u.surname}`, u.phone, "Thanks. Your insurer can see that you protected your vehicle and valuables before the flood.",
  ]);
  return json({ ok: true });
});
