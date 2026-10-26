import { endSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const POST = handle(async () => {
  await endSession();
  return json({ ok: true });
});
