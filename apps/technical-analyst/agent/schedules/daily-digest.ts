/**
 * Daily digest schedule.
 *
 * Fire-and-forget prompt into the agent. The agent is expected to:
 *
 *   1. Call `collect_activity({ kind: "daily" })`. Window = previous
 *      UTC calendar day. The tool never throws on partial collection;
 *      every endpoint reports availability individually.
 *   2. Build a 4-section report. Each item references a corpus id;
 *      URLs + titles come from the corpus, not the model.
 *   3. Call `submit_digest({ kind: "daily", report })`. The tool
 *      validates every reference id, renders authoritative links, and
 *      sends via Resend with a content-derived idempotency key.
 *
 * `cron` is `0 20 * * *` (22:00 Paris summer / 21:00 Paris winter).
 */
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 20 * * *",
  markdown: [
    "Compose the daily engineering digest for the previous UTC calendar day.",
    '1. Call `collect_activity({ kind: "daily" })`. The result is the authoritative source list (items + counts + availability).',
    "2. Write a 4-section report: TL;DR, Shipped, Risks & blockers, Watchlist. Each section has 0..8 items. Each item is `{ text, referenceId }` — `text` is your annotation; `referenceId` MUST be an `id` from the corpus.",
    '3. Call `submit_digest({ kind: "daily", report })`. The tool validates every reference id against the corpus, renders authoritative links, and sends via Resend with a content-derived idempotency key.',
    "If the corpus is empty AND no fetcher reported unavailable, the day was quiet — submit a report with zero items in every section. The renderer shows a quiet-period note plus the zero counts.",
    "Never invent PR numbers, URLs, authors, or commit counts. React auto-escapes any text you produce; do not pre-escape.",
  ].join("\n"),
});
