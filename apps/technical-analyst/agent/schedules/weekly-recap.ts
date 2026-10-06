/**
 * Weekly digest schedule.
 *
 * Per the runtime doc §4.2, the weekly digest is structurally similar
 * to the daily but with a 5-day window and 7 sections (TL;DR, Shipped,
 * In progress, Risks, Metrics, Trends, Next). The `computeWeeklyMetrics`
 * step in `lib/metrics.ts` is the only addition.
 *
 * Skip-if-empty: if no merged PRs, no incidents, and no alerts in the
 * window, the weekly digest sends a 200-word "low activity" digest
 * instead of padding.
 */
import { defineSchedule } from "eve/schedules";
import { env } from "../env.ts";

/**
 * Cron expression (UTC). Default "0 16 * * 5" = Friday 18:00 Paris
 * summer, 17:00 Paris winter.
 */
export default defineSchedule({
  cron: env.WEEKLY_CRON,
  markdown: [
    "Run the weekly digest workflow for env.GITHUB_ORG.",
    "1. Same boot + kill-switch + last-successful-run dedup as daily (see schedules/daily-digest.ts).",
    "2. Compute Monday → Friday window in env.DAILY_LOCAL_TIMEZONE.",
    "3. Call lib/fetch.ts (same endpoints as daily, plus getCommitActivity for week-over-week).",
    "4. Call lib/metrics.ts → WeeklyMetrics (DORA, throughput, aging, week-over-week deltas).",
    "5. If metrics indicate a 'low activity' week, send a 200-word stub digest (skip metrics section).",
    "6. Otherwise, call runWeeklyDigest() from lib/digest.ts with the full 7-section schema.",
    "7. On success, write last_successful_run:weekly = today (48h TTL).",
  ].join("\n"),
});
