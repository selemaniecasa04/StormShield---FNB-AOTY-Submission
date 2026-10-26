import { handleUssd } from "@/lib/ussd";
import { gatewayTrusted } from "@/lib/phone";
import { normPhone, limit } from "@/lib/http";
import { HttpError } from "@/lib/auth";
import { floodedFn, getSnapshot } from "@/lib/status";
import { USSD_CODE } from "@/lib/emergency";

export const dynamic = "force-dynamic";

const reply = (text: string, status = 200) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * USSD callback in the Africa's Talking format (also used by the on-screen feature phone).
 * POST sessionId, serviceCode, phoneNumber, text (inputs joined by "*"), networkCode.
 * Replies "CON <screen>" to continue or "END <screen>" to close the session.
 * A real gateway must send the header x-ussd-secret = USSD_SHARED_SECRET; without it only demo numbers work.
 */
export async function POST(req: Request) {
  try {
    limit(req, "ussd", 120, 60_000);
    const type = req.headers.get("content-type") ?? "";
    let f: Record<string, string> = {};
    if (type.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      f = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]));
    } else {
      const fd = await req.formData();
      fd.forEach((v, k) => (f[k] = typeof v === "string" ? v : ""));
    }
    const sessionId = (f.sessionId ?? "").slice(0, 80);
    const phone = normPhone(f.phoneNumber);
    const text = (f.text ?? "").slice(0, 400);
    if (!sessionId || !phone) return reply("END Invalid request.", 400);
    const { snap, event } = await getSnapshot();
    const out = await handleUssd({
      sessionId,
      serviceCode: (f.serviceCode || USSD_CODE).slice(0, 20),
      phone,
      text,
      network: (f.networkCode ?? "").slice(0, 10) || null,
      origin: gatewayTrusted(req) ? "gateway" : "simulator",
      eventId: event.id,
      snap,
      flooded: floodedFn(snap),
      originUrl: new URL(req.url).origin,
    });
    return reply(out);
  } catch (e) {
    if (e instanceof HttpError) return reply(`END ${e.message}`, e.status);
    console.error(e);
    return reply("END Service unavailable. Please try again. Emergency: 112.", 500);
  }
}
