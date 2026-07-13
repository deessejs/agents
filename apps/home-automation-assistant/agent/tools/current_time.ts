import { defineTool } from "eve/tools";
import { z } from "zod";
import { formatTimeBlock } from "@ds-team/agent-core/instructions/time";

// Returns the current time as a markdown block (UTC + Local + Day).
// Tool counterpart to the `## Current time` instruction block. The
// instruction block is session-scoped in eve (cached at session.started),
// which means it can go stale in long-lived Telegram sessions. This tool
// reads `new Date()` at call time, so the result is always fresh.
// Timezone: AGENT_TIMEZONE env var (IANA), falls back to UTC.
export default defineTool({
  description:
    "Returns the current time as a markdown block: UTC anchor + Local line " +
    "(named timezone + offset) + Day of week with ISO week number. Call this " +
    "BEFORE resolving relative time phrases (\"ce matin\", \"last Friday\", " +
    "\"in two hours\") instead of guessing from training data. The block is " +
    "always fresh (read at call time), unlike the session-scoped `## Current " +
    "time` instruction block which can go stale in long-lived sessions.",
  inputSchema: z.object({}),
  execute: () =>
    formatTimeBlock(new Date(), process.env.AGENT_TIMEZONE || "UTC"),
});