import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, normPhone, str } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const s = await requireUser();
  const b = await body(req);
  const name = str(b.name, 80);
  const relation = str(b.relation, 40) || "Family";
  const phone = normPhone(b.phone);
  const isContact = b.isContact === true;
  if (!name) return json({ error: "Name is required." }, 400);
  if (!phone) return json({ error: "Enter a valid phone number." }, 400);
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM family WHERE user_id = $1`, [s.uid]);
  if ((count?.n ?? 0) >= 12) return json({ error: "You can add up to 12 people." }, 400);
  const linked = await one<{ id: number }>(`SELECT id FROM users WHERE phone = $1 AND id <> $2`, [phone, s.uid]);
  await q(`INSERT INTO family (user_id, name, relation, phone, is_contact, linked_user_id, token) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    s.uid, name, relation, phone, isContact, linked?.id ?? null, crypto.randomUUID().replace(/-/g, ""),
  ]);
  return json({ ok: true, linked: !!linked });
});
