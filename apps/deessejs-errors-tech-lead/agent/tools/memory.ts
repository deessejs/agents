// Re-export the centralized memory tool from @ds-team/database.
// The agent context (ctx.agent.id = "deessejs-errors-tech-lead") is read
// at runtime by the centralized tool — never via the LLM input schema.
// See docs/internal/reports/memory-schema-refactor-2026-07-09.md.
export { default, memoryShare, memoryUnshare } from "@ds-team/database/tools/memory";
