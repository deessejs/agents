/**
 * Vercel Cron entry point for the weekly digest.
 */
import { runDailyDigest } from "../../../../lib/digest.ts";

export const maxDuration = 90; // seconds (P99 weekly ≈ 30 s; 3x headroom)

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    // Phase 2 ships the daily workflow first; weekly reuses the
    // same entry point. The schedule in agent/schedules/weekly-recap.ts
    // invokes this route with the appropriate `kind` override.
    const result = await runDailyDigest({ kind: "weekly" });
    return Response.json({ ok: true, messageId: result.messageId });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
