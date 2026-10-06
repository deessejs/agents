/**
 * Daily digest schedule.
 *
 * Per the runtime doc §4.1, this schedule is intentionally tiny: it
 * delegates to `runDailyDigest()` in `lib/digest.ts`, which is the
 * actual workflow. This separation keeps the schedule testable (you can
 * call `runDailyDigest()` from a test without firing a cron).
 *
 * eve generates a Vercel Cron entry from this `cron` field; the
 * corresponding route handler at `app/api/cron/daily-digest/route.ts`
 * is the `CRON_SECRET`-guarded entry point for the actual HTTP
 * request Vercel sends.
 */
import { defineSchedule } from "eve/schedules";
import { env } from "../env.ts";

/**
 * Cron expression (UTC). Default "0 20 * * *" = 22:00 Paris summer /
 * 21:00 Paris winter. The ±1h DST drift is accepted per the locked
 * decision (temp/technical-analyst-agent.md §12 #5).
 */
export default defineSchedule({
  cron: env.DAILY_CRON,
  /**
   * Fire-and-forget prompt. eve compiles this into the manifest and
   * turns it into the cron task's body at runtime. The actual
   * workflow is implemented in `lib/digest.ts` and called via the
   * route handler.
   */
  markdown: [
    "Run the daily digest workflow for env.GITHUB_ORG.",
    "1. Validate env (already done at boot).",
    "2. Check the kill-switch (kv.get('agents:paused')) — if true, abort with an info log.",
    "3. Check last_successful_run:daily in KV — if today's UTC date is already recorded, abort with an info log.",
    "4. Call runDailyDigest({ kind: 'daily' }) from lib/digest.ts.",
    "5. On success, write last_successful_run:daily = today (48h TTL) and emit the digest id in the root OTel span.",
  ].join("\n"),
});
