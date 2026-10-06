/**
 * Daily digest schedule.
 *
 * `markdown` form: a fire-and-forget prompt the agent executes on its
 * own clock. The agent is expected to:
 *   1. Call `collect_activity({ kind: "daily" })`.
 *   2. Synthesize a daily report citing corpus ids.
 *   3. Call `submit_digest({ kind: "daily", report })`.
 *
 * The agent owns synthesis; this prompt declares intent. Vercel Cron
 * evaluates the cron expression in UTC (`0 20 * * *` = 22:00 Paris
 * summer / 21:00 Paris winter — locked in the 2026-10-06 plan).
 */
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 20 * * *",
  markdown: [
    "Compose the daily engineering digest for the previous UTC day.",
    '1. Call `collect_activity({ kind: "daily" })` first. The result is the authoritative source list.',
    "2. Write a 4-section report: TL;DR, Shipped, Risks & blockers, Watchlist for tomorrow.",
    "3. Every item must reference an `id` from the corpus. The submit_digest tool rejects fabricated references.",
    '4. Call `submit_digest({ kind: "daily", report })`. Pass preview=true only when the operator asks for a preview run.',
    "5. If `collect_activity` returns zero sources for the period, call submit_digest with a single TL;DR section stating the period had no activity — do not invent work.",
    "Never fabricate PR numbers, URLs, authors, or commit counts. React auto-escapes any text you produce, so do not pre-escape.",
  ].join("\n"),
});
