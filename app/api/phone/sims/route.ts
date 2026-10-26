import { q } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { ZONE_BY_ID } from "@/lib/geo";

export const dynamic = "force-dynamic";

/** Demo SIM cards the on-screen feature phone can use. */
export const GET = handle(async () => {
  const rows = await q<{ phone: string; first_name: string; surname: string; home_zone: string | null; channel: string; email: string; language: string }>(
    `SELECT phone, first_name, surname, home_zone, channel, email, language FROM users
     WHERE role = 'user' AND demo AND (email IN ('gogo@stormshield.demo','thandi@stormshield.demo','pieter@stormshield.demo') OR (channel = 'ussd' AND phone LIKE '+2779%'))
     ORDER BY (email = 'gogo@stormshield.demo') DESC, (channel = 'ussd') DESC, id DESC LIMIT 8`,
  );
  const note: Record<string, string> = {
    "gogo@stormshield.demo": "Basic phone, no app · elderly · isiZulu · Thandi's mother",
    "thandi@stormshield.demo": "Also has the app (see her dashboard)",
    "pieter@stormshield.demo": "Also has the app · Afrikaans",
  };
  return json({
    sims: rows.map((r) => ({
      phone: r.phone,
      name: `${r.first_name}${r.surname ? ` ${r.surname}` : ""}`,
      area: r.home_zone ? ZONE_BY_ID[r.home_zone]?.name ?? null : null,
      note: note[r.email] ?? `Registered by USSD · ${r.language}`,
      featured: r.email === "gogo@stormshield.demo",
    })),
  });
});
