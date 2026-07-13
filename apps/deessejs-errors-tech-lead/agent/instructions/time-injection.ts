import { defineDynamic, defineInstructions } from "eve/instructions";
import { formatTimeBlock } from "@ds-team/agent-core/instructions/time";

/**
 * Inject the current time into every turn so the agent can resolve
 * relative phrases ("ce matin", "last night", "next Tuesday") without
 * asking the user.
 *
 * Timezone: read from AGENT_TIMEZONE (IANA, e.g. "Europe/Paris"). Falls
 * back to UTC if unset or invalid. The block always shows both lines,
 * so the user can spot a UTC fallback.
 *
 * Refreshed on `turn.started` rather than `session.started` because
 * Telegram sessions can idle for hours between user messages; the block
 * must be fresh per turn.
 *
 * See docs/internal/reports/time-awareness-injection-2026-07-13.md.
 */
export default defineDynamic({
  events: {
    "turn.started": async () => {
      const tz = process.env.AGENT_TIMEZONE || "UTC";
      return defineInstructions({
        markdown: formatTimeBlock(new Date(), tz),
      });
    },
  },
});