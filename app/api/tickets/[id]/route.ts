import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { body, handle, json, str } from "@/lib/http";
import { TICKET_FLOW, TICKET_STATUS_LABEL, type TicketStatus } from "@/lib/risk";
import { ticketRef } from "@/lib/users";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireUser();
  const id = Number((await ctx.params).id);
  const b = await body(req);
  const t = await one<{ id: number; user_id: number; event_id: number; status: string }>(`SELECT id, user_id, event_id, status FROM tickets WHERE id = $1`, [id]);
  if (!t) return json({ error: "Ticket not found." }, 404);
  const status = str(b.status, 20) as TicketStatus;
  if (!TICKET_FLOW.includes(status)) return json({ error: "Unknown status." }, 400);

  if (s.role !== "admin") {
    // Residents can only close their own ticket ("I'm OK now").
    if (t.user_id !== s.uid || status !== "resolved") return json({ error: "Not allowed." }, 403);
    await q(`UPDATE tickets SET status = 'resolved', updated_at = now(), note = coalesce(note, '') || ' [closed by resident]' WHERE id = $1`, [id]);
    await q(`UPDATE units SET status = 'available', ticket_id = NULL WHERE ticket_id = $1`, [id]);
    return json({ ok: true });
  }

  const team = str(b.team, 60) || null;
  await q(`UPDATE tickets SET status = $2, team = coalesce($3, team), updated_at = now() WHERE id = $1`, [id, status, team]);
  if (status === "resolved") await q(`UPDATE units SET status = 'available', ticket_id = NULL WHERE ticket_id = $1`, [id]);
  const u = await one<{ first_name: string; surname: string; phone: string }>(`SELECT first_name, surname, phone FROM users WHERE id = $1`, [t.user_id]);
  if (u) {
    const msg =
      status === "resolved"
        ? `Ticket ${ticketRef(id)} has been closed. If you still need help, press the panic button again.`
        : `Update on ${ticketRef(id)}: ${TICKET_STATUS_LABEL[status]}${team ? ` (${team})` : ""}.`;
    await q(`INSERT INTO messages (event_id, user_id, to_name, to_phone, channel, body) VALUES ($1,$2,$3,$4,'sms',$5)`, [t.event_id, t.user_id, `${u.first_name} ${u.surname}`, u.phone, msg]);
  }
  return json({ ok: true });
});
