import { defineMcpClientConnection } from "eve/connections";

/**
 * GitHub MCP connection — shared by every ds-team agent.
 *
 * URL:     https://api.githubcopilot.com/mcp/
 * Auth:    PAT passed as `Authorization: Bearer …`
 * Env var: GITHUB_TOKEN  (https://github.com/settings/tokens)
 *
 * Security stance (revised 2026-07-09 after several pivots — see commit
 * messages):
 *
 * - The connection is **permissive by design**. Reads AND writes are
 *   exposed. The model's behavior is shaped by:
 *     - the agent's system prompt (`instructions.md`) per agent
 *     - the canonical skill bodies (`agent/skills/*.md`)
 *     - conversation-level preview-then-confirm in the skill procedures
 *
 * - We do NOT use `X-MCP-Readonly: true`. The upstream server docs are
 *   explicit: read-only mode is a strict security filter that takes
 *   precedence over any other configuration, including `X-MCP-Tools`.
 *   When it was set, the model reported the allowed writes
 *   (github__create_issue, github__update_issue_labels,
 *   github__add_issue_comment) as not exposed.
 *
 * - We do NOT use `X-MCP-Exclude-Tools` (per design pivot). The surface
 *   stays open; the system prompt + skill bodies are the behavioral
 *   control.
 *
 * - We do NOT use `approval` (per design pivot, 2026-07-09). Every
 *   write runs without a HITL pause at the connection layer. The
 *   skill-level preview-then-confirm in conversation is the soft gate.
 *
 * - We do NOT use the `tools: { allow | block }` field. That would be
 *   client-side filtering in eve, also exclusion in spirit.
 *
 * - The only HTTP header set is `X-MCP-Toolsets`, scoping the upstream
 *   toolset surface to repos / issues / pull_requests.
 *
 * Next step (not done now): replace this shared connection on
 * `deessejs-errors-tech-lead` with a dedicated one that hardcodes
 * `owner="deessejs"`, `repo="errors"` as defaults, so the repo scope
 * is enforced at the connection layer (design doc §6.2 / §7).
 *
 * Discovered tools surface to the model as `github__*`
 *   e.g. github__get_file_contents, github__list_commits, github__list_issues,
 *        github__issue_read, github__create_issue, github__update_issue_labels,
 *        github__add_issue_comment, … and all other upstream tools.
 */
export function makeGitHubConnection() {
  return defineMcpClientConnection({
    url: "https://api.githubcopilot.com/mcp/",
    description:
      "GitHub: full read and write surface of the upstream MCP server. No gating at the connection layer — the agent's system prompt and skill bodies shape behavior, and skill procedures preview before writing.",
    auth: {
      getToken: async () => ({ token: process.env.GITHUB_TOKEN! }),
    },
    headers: {
      // Toolsets: full surface — reads + writes. We don't filter at the
      // connection layer; filtering happens at the LLM/system-prompt
      // layer via the agent's instructions and skill bodies.
      "X-MCP-Toolsets": "repos,issues,pull_requests",
    },
  });
}

export default makeGitHubConnection;