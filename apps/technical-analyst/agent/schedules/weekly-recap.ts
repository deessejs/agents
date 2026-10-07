/**
 * Weekly recap schedule.
 *
 * Fire-and-forget prompt into the agent. The agent is expected to:
 *
 *   1. Call `collect_activity({ kind: "weekly" })`. Window = current
 *      ISO week, Monday 00:00 UTC → collection instant. A Friday run
 *      covers Monday → Friday. The tool never throws on partial
 *      collection; every endpoint reports availability individually.
 *   2. Build a 7-section report. Quote `corpus.weeklyMetrics` verbatim
 *      in the Key metrics section — they are pre-computed.
 *   3. Call `submit_digest({ kind: "weekly", report })`.
 *
 * `cron` is `0 16 * * 5` (Friday 18:00 Paris summer / 17:00 Paris
 * winter).
 */
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 16 * * 5",
  markdown: [
    "Compose the weekly engineering recap for the current ISO week (Monday 00:00 UTC → now).",
    '1. Call `collect_activity({ kind: "weekly" })`. The result includes pre-computed weekly metrics (`corpus.weeklyMetrics`) and an explicit availability list for any source that failed.',
    "2. Write a 7-section report: TL;DR, Shipped, In progress, Risks & blockers, Key metrics, Trends, Decisions needed / Next week focus. Each section has 0..8 items. Quote the pre-computed metrics verbatim in the Key metrics section. Do not invent numbers.",
    '3. Call `submit_digest({ kind: "weekly", report })`. The tool validates every reference id against the corpus, renders authoritative links, and sends via Resend with a content-derived idempotency key.',
    "If the corpus is empty AND no fetcher reported unavailable, the week was quiet — submit a report with zero items in every section. The renderer shows a quiet-period note plus the zero counts.",
    "Never invent PR numbers, URLs, authors, commit counts, or DORA metrics. React auto-escapes any text you produce; do not pre-escape.",
  ].join("\n"),
});
