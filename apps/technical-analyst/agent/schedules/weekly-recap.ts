/**
 * Weekly recap schedule.
 *
 * `markdown` form: a fire-and-forget prompt the agent executes on its
 * own clock. The agent is expected to:
 *   1. Call `collect_activity({ kind: "weekly" })`. The window covers
 *      the most recent Monday 00:00 UTC → now (floored to 5 days).
 *   2. Synthesize a 7-section weekly report citing corpus ids.
 *   3. Call `submit_digest({ kind: "weekly", report })`.
 *
 * `cron` is `0 16 * * 5` (Friday 18:00 Paris summer / 17:00 Paris
 * winter — locked in the 2026-10-06 plan).
 */
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 16 * * 5",
  markdown: [
    "Compose the weekly engineering recap for the Mon-Fri period.",
    '1. Call `collect_activity({ kind: "weekly" })` first. The window covers Monday 00:00 UTC → now and is at least 5 days long.',
    "2. Write a 7-section report: TL;DR, Shipped, In progress, Risks & blockers, Key metrics, Trends, Decisions needed / Next week focus.",
    "3. Every item must reference an `id` from the corpus. The submit_digest tool rejects fabricated references.",
    "4. For the Key metrics section, calculate the numbers in code (e.g. count of merged_pr sources, count of dependabot_alert sources). Do not invent metrics.",
    '5. Call `submit_digest({ kind: "weekly", report })`.',
    "6. If `collect_activity` returns zero sources for the period, call the `no_reply` opt-in tool instead of submit_digest — a quiet week is itself the report.",
    "Never fabricate PR numbers, URLs, authors, commit counts, or DORA metrics. React auto-escapes any text you produce, so do not pre-escape.",
  ].join("\n"),
});
