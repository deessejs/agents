import { defineDynamic, defineInstructions } from "eve/instructions";
import { formatTimeBlock } from "@ds-team/agent-core/instructions/time";

// Inject current time on every turn so the agent can resolve relative
// phrases ("ce matin", "last night", "next Tuesday") without asking.
// Timezone: AGENT_TIMEZONE env var (IANA), falls back to UTC.
// Refreshed on turn.started — Telegram sessions idle for hours.
// See docs/internal/reports/time-awareness-injection-2026-07-13.md.
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