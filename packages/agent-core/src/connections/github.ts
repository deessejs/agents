import { defineMcpClientConnection } from "eve/connections";

/**
 * GitHub MCP connection — shared by every ds-team agent.
 *
 * URL:     https://api.githubcopilot.com/mcp/
 * Auth:    PAT passed as `Authorization: Bearer …`
 * Env var: GITHUB_TOKEN  (https://github.com/settings/tokens)
 *
 * Security stance:
 * - `X-MCP-Readonly: true` puts the server in read-only mode: it filters
 *   out every write tool regardless of any other configuration (per the
 *   upstream server docs). This is a structural block, not a textual one.
 * - `X-MCP-Tools` re-enables a small, explicit allowlist of write tools.
 *   The list is the single source of truth for which write surfaces agents
 *   can reach. To extend it (e.g. add review_pr for phase 4), append to
 *   the list — nothing else changes.
 * - The MCP server exposes many write tools (push_commit,
 *   merge_pull_request, create_pull_request, dismiss_review,
 *   request_review, update_pull_request_branch, edit_labels, ...).
 *   Blocked by default; only the names in `X-MCP-Tools` below are
 *   reachable.
 * - The `approval` policy below gates the writes further: every call to a
 *   tool in the allowlist pauses for a human confirmation through the
 *   channel's HITL surface (Telegram inline-keyboard buttons for the
 *   tech-lead). Reads stay ungated because the daily-digest schedule and
 *   other consumers rely on them firing without user input.
 *
 * Today the allowlist is (added 2026-07-09):
 *   create_issue          — open-github-issue skill
 *   update_issue_labels   — triage skill (replace label set on an issue)
 *   add_issue_comment     — triage skill (post a Triage Review comment)
 *
 * Verified against the upstream toolsnap files in
 * github/github-mcp-server/pkg/github/__toolsnaps__/ — the granular
 * `update_issue_labels` (replaces the whole label set) is preferred over
 * an umbrella `update_issue` because the latter is split into per-field
 * tools by the upstream server (update_issue_state, update_issue_title,
 * update_issue_body, update_issue_assignees, update_issue_milestone,
 * update_issue_type, update_issue_labels). Triage only needs to add
 * labels, so `update_issue_labels` is the surgical choice. Same logic
 * for comments: `add_issue_comment` is the dedicated POST, not a generic
 * `update_issue`.
 *
 * Next step (not done now): replace this shared connection on
 * `deessejs-errors-tech-lead` with a dedicated one that hardcodes
 * `owner="deessejs"`, `repo="errors"` as defaults, so the repo scope is
 * enforced at the connection layer (the design-doc §6.2 / §7 commitment).
 *
 * Discovered tools surface to the model as `github__*`
 *   e.g. github__get_file_contents, github__list_commits, github__list_issues,
 *        github__issue_read, github__create_issue, github__update_issue_labels,
 *        github__add_issue_comment.
 */
export function makeGitHubConnection() {
  return defineMcpClientConnection({
    url: "https://api.githubcopilot.com/mcp/",
    description:
      "GitHub: read repositories, issues, pull requests, and code. Write surface is restricted by an explicit allowlist; today the reachable write tools are create_issue, update_issue_labels, and add_issue_comment.",
    auth: {
      getToken: async () => ({ token: process.env.GITHUB_TOKEN! }),
    },
    headers: {
      "X-MCP-Readonly": "true",
      "X-MCP-Toolsets": "repos,issues,pull_requests",
      "X-MCP-Tools": "create_issue,update_issue_labels,add_issue_comment",
    },
    approval: ({ toolName }) => {
      // Per node_modules/eve/docs/connections/mcp.mdx §"Gate specific tools
      // by name or input", the qualified tool name arrives as
      // `<connection>__<tool>`. Gate only the writes; reads stay ungated.
      return toolName === "github__create_issue"
        || toolName === "github__update_issue_labels"
        || toolName === "github__add_issue_comment"
        ? "user-approval"
        : "not-applicable";
    },
  });
}

export default makeGitHubConnection;
