/**
 * Vercel Cron entry point for the daily digest.
 *
 * Per the runtime doc §4.6 (3e-round FIX 2): the CRON_SECRET Bearer
 * guard lives ONLY here, not inside `runDailyDigest()`. The inner
 * function is testable from a unit test without an HTTP request.
 */
import { runDailyDigest } from "../../../../lib/digest.ts";

export const maxDuration = 60; // seconds (P99 daily ≈ 15 s; 4x headroom)

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runDailyDigest({ kind: "daily" });
    return Response.json({ ok: true, messageId: result.messageId });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
