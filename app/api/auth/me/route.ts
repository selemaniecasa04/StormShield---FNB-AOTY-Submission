import { getSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await getSession();
  if (!s) return json({ user: null });
  const u = await one<{ first_name: string; surname: string; email: string; home_lat: number; home_lng: number; language: string }>(
    `SELECT first_name, surname, email, home_lat, home_lng, language FROM users WHERE id = $1`,
    [s.uid],
  );
  if (!u) return json({ user: null });
  return json({
    user: { id: s.uid, role: s.role, firstName: u.first_name, surname: u.surname, email: u.email, home: [u.home_lat, u.home_lng], language: u.language },
  });
});
