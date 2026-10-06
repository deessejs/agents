/**
 * Daily digest schedule.
 *
 * `markdown` form: a fire-and-forget prompt the agent executes on its
 * own clock. The agent is expected to:
 *
 *   1. Call `collect_activity({ kind: "daily" })` first. The result is
 *      the authoritative source list. It covers the previous UTC
 *      calendar day. The tool never throws on partial collection —
 *      per-source availability is reported for every endpoint.
 *   2. Build a report whose every item references a corpus id. URLs +
 *      titles come from the corpus, not the model. Sections may be
 *      omitted (0..8 items each); the renderer shows a quiet-period
 *      note only when authoritative counts AND availability support it.
 *   3. Call `submit_digest({ kind: "daily", report })`. The tool
 *      validates every reference id, renders authoritative links, and
 *      sends via Resend with a content-derived idempotency key.
 *
 *   4. If the corpus is empty AND no fetcher reported unavailable,
 *      the day was quiet — submit a report with no items in any
 *      section. The renderer shows a quiet-period note plus the
 *      zero counts. Do NOT invent references.
 *
 *   5. If the model writes nothing, finish the turn; Eve marks the
 *      run unsuccessful.
 *
 * `cron` is `0 20 * * *` (22:00 Paris summer / 21:00 Paris winter).
 */
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 20 * * *",
  markdown: [
    "Compose the daily engineering digest for the previous UTC calendar day.",
    '1. Call `collect_activity({ kind: "daily" })` first. The result is the authoritative source list (items + counts + availability).',
    "2. Write a 4-section report: TL;DR, Shipped, Risks & blockers, Watchlist. Each section has 0..8 items. Each item is `{ text, referenceId }` — `text` is your annotation; `referenceId` MUST be an `id` from the corpus.",
    '4. Call `submit_digest({ kind: "daily", report })`. The tool validates every reference id against the corpus, renders authoritative links, and sends via Resend with a content-derived idempotency key.',
    "5. If the corpus is empty AND no fetcher reported unavailable, the day was quiet — submit a report with zero items in every section. The renderer shows a quiet-period note plus the zero counts. Do NOT invent references.",
    "6. If you finish the turn without calling `submit_digest`, Eve marks the schedule run unsuccessful.",
    "Never invent PR numbers, URLs, authors, or commit counts. React auto-escapes any text you produce; do not pre-escape.",
  ].join("\n"),
});
