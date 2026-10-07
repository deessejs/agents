/**
 * Daily digest schedule.
 *
 * Fire-and-forget prompt into the agent. The agent is expected to:
 *
 *   1. Call `collect_activity({ kind: "daily" })` first. Window =
 *      previous UTC calendar day. The tool never throws on partial
 *      collection; every endpoint reports availability individually.
 *   2. Build a 4-section report (see the markdown below). Each
 *      item references a corpus id; URLs + titles come from the
 *      corpus, not the model.
 *   3. Call `submit_digest({ kind: "daily", report })`. The tool
 *      validates every reference id, renders authoritative links,
 *      and sends via Resend with a content-derived idempotency key.
 *
 * `cron` is `0 20 * * *` (22:00 Paris summer / 21:00 Paris winter).
 */
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 20 * * *",
  markdown: [
    "Compose the daily engineering digest for the previous UTC calendar day.",
    "",
    '1. Call `collect_activity({ kind: "daily" })`. The result is the authoritative source list (items + counts + availability).',
    "",
    "2. Build a 4-section report. Target length: 300-500 words usually, 5 lines on a quiet day. Each section has 0..8 items. Each item is `{ text, referenceId }` — `text` is your annotation; `referenceId` MUST be an `id` from the corpus. For pull request and run references, prefer `org/repo#NNN` or `org/repo@<sha>` so the renderer can link them.",
    "",
    "**Summary** (section kind: `tldr`). One short paragraph (1-3 sentences) covering what advanced and the single point that, if any, deserves the operator's attention. No severity words, no invented causes.",
    "",
    '**Needs attention** (section kind: `risks`). 0-3 items. Each item names a fact (e.g. "50 CI runs failed in the period"), names the next verification the operator should run (e.g. "check the latest run on the relevant branch and commit; if still failing, inspect the first failed step before attributing a cause"), and links to the source. Skip this section when there is nothing actionable.',
    "",
    '**Merged changes** (section kind: `shipped`). 0-8 items. Each item is `org/repo#NNN — one short annotation (1-2 sentences) — refTitle`. A merge is not a deployment; do not describe a merged PR as "shipped" or "live". Include the staging merge as one item among the rest, not as a separate heading.',
    "",
    "**Coverage** (section kind: `watchlist`). 0-1 items. Use ONLY for: a notable change since the last digest, an explicit review request, a documented blocker, or a known deadline. A pull request does not earn a place by existing. A quiet day has no coverage items.",
    "",
    "**Special cases.**",
    "- If a security endpoint (Dependabot / CodeQL / secret-scanning) failed, surface it as `Security coverage unavailable: <endpoint list> returned 403. Alert counts are unknown; check the collector's access and endpoint responses.` Do not infer the missing scope from the status code. Do not list `0 alerts` for an unavailable source.",
    '- If a canary or release was published and a related verify workflow is in the corpus as failed, mention the release and add one item to **Needs attention** with the verify failure as the next verification. Do not call the canary "broken" without further evidence.',
    "- If a section has no items, omit it from the JSON. Submit at least one section.",
    "",
    '3. Call `submit_digest({ kind: "daily", report })`. The tool validates every reference id against the corpus, renders authoritative links, and sends via Resend with a content-derived idempotency key.',
    "",
    "Never invent PR numbers, URLs, authors, commit counts, branch names, or commit SHAs. React auto-escapes any text you produce; do not pre-escape.",
  ].join("\n"),
});
