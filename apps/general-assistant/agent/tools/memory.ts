// Per-agent memory tools. agentId is baked in via the factory closure —
// the LLM cannot fake it. See docs/internal/reports/memory-schema-refactor-2026-07-09.md.
import { createMemoryTools } from "@ds-team/database/tools/memory";
const tools = createMemoryTools("general-assistant");
export default tools.memory;
export const memoryShare = tools.memoryShare;
export const memoryUnshare = tools.memoryUnshare;