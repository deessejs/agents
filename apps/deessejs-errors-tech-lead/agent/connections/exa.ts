// eve autoloads MCP connection definitions from `agent/connections/*`.
// We re-export the shared Exa connection built in @ds-team/agent-core.
// Exa powers the `web_search` tool (phase 6) and is mandated by
// deessejs/errors/CLAUDE.md as the project's web-search tool.
export { default } from "@ds-team/agent-core/connection/exa";