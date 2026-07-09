import { defineMcpClientConnection } from "eve/connections";

/**
 * GitHub MCP connection — shared by every ds-team agent.
 *
 * URL:     https://api.githubcopilot.com/mcp/
 * Auth:    PAT passed as `Authorization: Bearer …`
 * Env var: GITHUB_TOKEN  (https://github.com/settings/tokens)
 *
 * Security stance (added 2026-07-09):
 * - `X-MCP-Readonly: true` puts the server in read-only mode: it filters out
 *   every write tool regardless of any other configuration (per upstream
 *   server docs). This is a structural block, not a textual one.
 * - `X-MCP-Tools: create_issue` re-enables exactly one write tool — the only
 *   surface the ds-team agents need today (used by the `open-github-issue`
 *   skill on `deessejs-errors-tech-lead`).
 * - Blocked by design (the model cannot surface them at all):
 *   push_commit, merge_pull_request, create_pull_request,
 *   dismiss_review, request_review, edit_labels, set_repo_settings, …
 * - To extend the allowlist later (e.g. comment_on_issue for triage in
 *   phase 4, or review_pr for phase 4 reviews), append to `X-MCP-Tools`.
 *   The list is the single source of truth for which write surfaces agents
 *   can reach.
 *
 * Next step (not done now): replace this shared connection on
 * `deessejs-errors-tech-lead` with a dedicated one that hardcodes
 * `owner="deessejs"`, `repo="errors"` as defaults, so the repo scope is
 * enforced at the connection layer (the design-doc §6.2 / §7 commitment).
 *
 * Discovered tools surface to the model as `github__*`
 *   e.g. github__get_file_contents, github__list_commits, github__create_issue.
 */
export function makeGitHubConnection() {
  return defineMcpClientConnection({
    url: "https://api.githubcopilot.com/mcp/",
    description:
      "GitHub: read repositories, issues, pull requests, and code. Write surface is restricted by an explicit allowlist; today only create_issue is reachable.",
    auth: {
      getToken: async () => ({ token: process.env.GITHUB_TOKEN! }),
    },
    headers: {
      "X-MCP-Readonly": "true",
      "X-MCP-Toolsets": "repos,issues,pull_requests",
      "X-MCP-Tools": "create_issue",
    },
  });
}

export default makeGitHubConnection;
