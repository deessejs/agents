/**
 * Daily digest schedule.
 *
 * `markdown` form: a fire-and-forget prompt the agent executes on its
 * own clock. The agent is expected to:
 *   1. Call `collect_activity({ kind: "daily" })`. The corpus covers
 *      the previous UTC calendar day.
 *   2. Build a 4-section report whose every item references a corpus
 *      id. URLs come from the corpus, not the model.
 *   3. Call `submit_digest({ kind: "daily", report })`. The tool
 *      renders authoritative links, persists the payload to KV,
 *      sends via Resend, and writes the delivery record.
 *
 *   4. If `collect_activity` returns zero sources AND zero availability
 *      entries, the day was quiet — submit a single-section TL;DR
 *      digest stating so. The schedule still publishes; an empty day
 *      is itself news.
 *
 * `cron` is `0 20 * * *` (22:00 Paris summer / 21:00 Paris winter).
 */
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 20 * * *",
  markdown: [
    "Compose the daily engineering digest for the previous UTC calendar day.",
    '1. Call `collect_activity({ kind: "daily" })` first. The result is the authoritative source list.',
    "2. Write a 4-section report: TL;DR, Shipped, Risks & blockers, Watchlist.",
    "   Each item is `{ text, referenceId }` — `text` is your annotation; `referenceId` MUST be a `id` from the corpus.",
    '3. Call `submit_digest({ kind: "daily", report })`. The tool renders authoritative links, persists the payload to KV, and sends via Resend with a content-derived idempotency key.',
    "4. If the corpus is empty AND no optional fetcher reported unavailable, the day was quiet — submit a single TL;DR section stating 'No activity for ${prevLabel}' citing any open PR id you wish. Do NOT invent work.",
    "5. If an essential source (security alerts) is unavailable, `collect_activity` throws. Do not retry it. End the turn; the schedule marks the run as failed.",
    "Never invent PR numbers, URLs, authors, or commit counts. React auto-escapes any text you produce; do not pre-escape.",
  ].join("\n"),
});
