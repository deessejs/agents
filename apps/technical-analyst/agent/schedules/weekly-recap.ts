/**
 * Weekly recap schedule.
 *
 * `markdown` form: a fire-and-forget prompt the agent executes on its
 * own clock. The agent is expected to:
 *   1. Call `collect_activity({ kind: "weekly" })`. The window covers
 *      the previous ISO week (Mon 00:00 UTC → next Mon 00:00 UTC).
 *   2. Build a 7-section report. The corpus supplies pre-computed
 *      weekly metrics (in `corpus.weeklyMetrics`); quote those numbers,
 *      do not invent them.
 *   3. Call `submit_digest({ kind: "weekly", report })`.
 *
 * `cron` is `0 16 * * 5` (Friday 18:00 Paris summer / 17:00 Paris
 * winter — locked in the 2026-10-06 plan).
 */
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 16 * * 5",
  markdown: [
    "Compose the weekly engineering recap for the previous ISO week (Mon 00:00 UTC → next Mon 00:00 UTC).",
    '1. Call `collect_activity({ kind: "weekly" })` first. The result includes pre-computed weekly metrics (`corpus.weeklyMetrics`) and an explicit availability list for any optional source that failed.',
    "2. Write a 7-section report: TL;DR, Shipped, In progress, Risks & blockers, Key metrics, Trends, Decisions needed / Next week focus.",
    "   Each item is `{ text, referenceId }`. Quote the pre-computed metrics verbatim in the Key metrics section. Do not invent numbers.",
    '3. Call `submit_digest({ kind: "weekly", report })`. The tool validates every reference id against the corpus, renders authoritative links, persists the payload to KV, and sends via Resend with a content-derived idempotency key.',
    "4. If `collect_activity` reports zero sources AND zero availability, the week was quiet — submit a single TL;DR section stating 'No activity for ${weekStartLabel}'. The recap is the empty week, not a fabricated activity summary.",
    "Never invent PR numbers, URLs, authors, commit counts, or DORA metrics. React auto-escapes any text you produce; do not pre-escape.",
  ].join("\n"),
});
