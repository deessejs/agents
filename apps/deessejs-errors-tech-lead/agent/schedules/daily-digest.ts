import { defineSchedule } from "eve/schedules";
import telegram from "../channels/telegram.js";

/**
 * Daily digest for deessejs/errors.
 *
 * Once per day at 17:30 UTC (≈ 18:30 CET winter; 18:30 CEST summer runs an
 * hour earlier because Vercel Cron has no DST awareness), this schedule
 * wakes, asks the agent to fetch the last 24h of commits on deessejs/errors
 * via the GitHub MCP, formats a concise report, and posts it to the user
 * via Telegram. On a quiet day the agent finishes without delivering.
 *
 * Design + decisions:
 * docs/internal/reports/daily-digest-design-2026-07-09.md
 *
 * DST-clean migration path: replace this with `defineSchedule({ cron: "* * * * *" })`
 * + the dynamic-scheduling pattern from
 * node_modules/eve/docs/patterns/dynamic-scheduling.md, backed by a
 * scheduleStore row whose `nextRunAt` carries an explicit `Europe/Paris`
 * offset.
 */
export default defineSchedule({
  cron: "30 17 * * *",
  async run({ receive, waitUntil, appAuth }) {
    const chatId = process.env.TELEGRAM_ALLOWED_USER_ID;
    if (!chatId) {
      // Nothing to deliver to. The next day's fire retries automatically.
      console.error(
        "[daily-digest] TELEGRAM_ALLOWED_USER_ID is not set; cannot deliver.",
      );
      return;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const prompt = [
      "Daily digest for the deessejs/errors repository.",
      "",
      "Step 1 — fetch exactly once via the GitHub MCP:",
      "  tool:   github__list_commits",
      '  owner:  "deessejs"',
      '  repo:   "errors"',
      '  sha:    "main"',
      `  since:  "${since}"`,
      "Do NOT call any other github__ tool. Do NOT use web_search.",
      "",
      "Step 2 — branch on the result.",
      "",
      "If the result has zero commits:",
      "  - Produce NO text output. Finish the turn silently.",
      "  - The Telegram channel delivers nothing. This is the intended empty-day behavior.",
      "",
      "If the result has N >= 1 commits:",
      "  - Emit ONE block of text in your response. That text IS the Telegram delivery:",
      "",
      "    📬 deessejs/errors — <N> commits on main since <since>.",
      "",
      "    • <short-sha> <author> — <message subject>",
      "    • ...",
      "",
      "  - One line per commit, up to 10 entries.",
      "  - <short-sha>         = first 7 characters of the commit SHA.",
      "  - <author>            = commit author name or login.",
      "  - <message subject>   = first line of the commit message, trimmed, no quotes, no Markdown.",
      "  - If N > 10, append a final line: (M others on GitHub.) where M = N − 10.",
      "",
      "Step 3 — output rules:",
      "  - Do not call receive(). Do not echo this prompt. Do not add commentary before or after the formatted block.",
    ].join("\n");

    waitUntil(
      receive(telegram, {
        message: prompt,
        target: { chatId },
        auth: appAuth,
      }),
    );
  },
});
