import { q, one } from "@/lib/db";
import { requireInsurer } from "@/lib/auth";
import { body, handle, json, num, str } from "@/lib/http";
import { audit } from "@/lib/status";
import { CLAIM_STATUS_LABEL, claimRef, insurerName, rand } from "@/lib/insurance";

/** Move a claim through the insurer's workflow; the policyholder sees each step. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireInsurer();
  const id = Number((await ctx.params).id);
  const me = await one<{ first_name: string; surname: string; insurer_id: string }>(`SELECT first_name, surname, insurer_id FROM users WHERE id = $1`, [s.uid]);
  const c = await one<{ id: number; user_id: number; event_id: number; insurer_id: string; status: string }>(`SELECT id, user_id, event_id, insurer_id, status FROM claims WHERE id = $1`, [id]);
  if (!c || c.insurer_id !== me?.insurer_id) return json({ error: "Claim not found." }, 404);
  const b = await body(req);
  const status = str(b.status, 12);
  if (!(status in CLAIM_STATUS_LABEL)) return json({ error: "Unknown status." }, 400);
  const assessor = str(b.assessor, 80) || null;
  const amount = num(b.amount);
  if (status === "approved" && (amount === null || amount <= 0)) return json({ error: "Enter the approved amount." }, 400);
  await q(`UPDATE claims SET status = $2, assessor = coalesce($3, assessor), amount = coalesce($4, amount), updated_at = now() WHERE id = $1`, [id, status, assessor, amount !== null ? Math.round(amount) : null]);
  const u = await one<{ first_name: string; surname: string; phone: string }>(`SELECT first_name, surname, phone FROM users WHERE id = $1`, [c.user_id]);
  const name = insurerName(c.insurer_id);
  const text =
    status === "assessor" ? `${name}: an assessor (${assessor ?? "our team"}) has been assigned to claim ${claimRef(id)} and will contact you.`
    : status === "approved" ? `${name}: claim ${claimRef(id)} has been approved for ${rand(amount!)}.`
    : status === "settled" ? `${name}: claim ${claimRef(id)} has been paid out.`
    : status === "rejected" ? `${name}: claim ${claimRef(id)} could not be approved. An agent will call you to explain.`
    : `${name}: claim ${claimRef(id)} status: ${CLAIM_STATUS_LABEL[status]}.`;
  if (u) await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'sms',$5)`, [c.event_id, c.user_id, `${u.first_name} ${u.surname}`, u.phone, text]);
  await audit(s.uid, `${me!.first_name} ${me!.surname}`, "claim", `${claimRef(id)} → ${CLAIM_STATUS_LABEL[status]}`);
  return json({ ok: true });
});
