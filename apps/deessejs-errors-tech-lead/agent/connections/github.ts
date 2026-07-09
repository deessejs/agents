// eve autoloads MCP connection definitions from `agent/connections/*`.
// We re-export the shared GitHub connection built in @ds-team/agent-core.
//
// This is the ONLY path the agent uses to read or write deessejs/errors:
// no local checkout, no workspace import — every read and every write goes
// through the GitHub MCP. The GITHUB_TOKEN used at deploy time MUST be a
// fine-grained PAT restricted to the deessejs/errors repository with
// `issues:write` + `pull_requests:write` only — never `contents:write`.
// Tool-level repo-scope guardrails are added in later phases.
export { default } from "@ds-team/agent-core/connection/github";