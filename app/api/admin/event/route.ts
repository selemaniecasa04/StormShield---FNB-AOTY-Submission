import { q } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, handle, json, num, str } from "@/lib/http";
import { audit, currentEvent, eventHour, getSnapshot } from "@/lib/status";
import { one } from "@/lib/db";
import { seedAlertHistory, syncAlerts } from "@/lib/alerts";
import { drillSnapshot } from "@/lib/engine";
import { DRILL_TITLE } from "@/lib/schema";

const clampHour = (h: number) => Math.max(-3, Math.min(30, h));

export const POST = handle(async (req: Request) => {
  const s = await requireAdmin();
  const b = await body(req);
  const action = str(b.action, 20);
  const me = await one<{ first_name: string; surname: string }>(`SELECT first_name, surname FROM users WHERE id = $1`, [s.uid]);
  await audit(s.uid, `${me?.first_name} ${me?.surname}`, "event", `Drill/event control: ${action}${b.hour !== undefined ? ` (hour ${b.hour})` : ""}${b.speed !== undefined ? ` (speed ${b.speed})` : ""}`);
  const ev = await currentEvent();

  if (action === "speed" || action === "pause" || action === "play" || action === "set_hour") {
    if (ev.mode !== "drill") return json({ error: "Start a drill first." }, 400);
    const now = eventHour(ev);
    const hour = action === "set_hour" ? clampHour(num(b.hour) ?? now) : now;
    const speed = action === "pause" ? 0 : action === "set_hour" ? ev.speed : Math.max(0, Math.min(240, num(b.speed) ?? 30));
    await q(`UPDATE events SET anchor_hour = $2, anchor_at = now(), speed = $3 WHERE id = $1`, [ev.id, hour, speed]);
    await syncAlerts(q, ev.id, drillSnapshot(hour), true);
    return json({ ok: true });
  }

  if (action === "restart" || action === "live") {
    await q(`UPDATE events SET ended_at = now() WHERE id = $1`, [ev.id]);
    if (action === "live") {
      await q(`INSERT INTO events (mode, title) VALUES ('live', 'Live monitoring')`);
    } else {
      const hour = clampHour(num(b.hour) ?? 0);
      const title = str(b.title, 80) || DRILL_TITLE;
      const rows = await q<{ id: number }>(`INSERT INTO events (mode, title, anchor_hour, speed) VALUES ('drill', $1, $2, 0) RETURNING id`, [title, hour]);
      if (hour > 0) await seedAlertHistory(q, rows[0].id, hour);
    }
    const { snap, event } = await getSnapshot();
    await syncAlerts(q, event.id, snap, true);
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
});
