import { defineMcpClientConnection } from "eve/connections";

/**
 * GitHub MCP connection — read and write repos, issues, and pull requests.
 *
 * URL:     https://api.githubcopilot.com/mcp/
 * Auth:    PAT passed as `Authorization: Bearer …`
 * Env var: GITHUB_TOKEN  (https://github.com/settings/tokens)
 *
 * Toolsets enabled by default: repos, issues, pull_requests
 *   Adjust the `X-MCP-Toolsets` header as your agent's needs evolve.
 *
 * Discovered tools surface to the model as `github__*`
 *   e.g. github__list_repos, github__get_file_contents, github__create_issue.
 */
export function makeGitHubConnection() {
  return defineMcpClientConnection({
    url: "https://api.githubcopilot.com/mcp/",
    description:
      "GitHub: read and write repositories, issues, and pull requests. Use github__* tools to query or modify GitHub resources the token has access to.",
    auth: {
      getToken: async () => ({ token: process.env.GITHUB_TOKEN! }),
    },
    headers: {
      "X-MCP-Toolsets": "repos,issues,pull_requests",
    },
  });
}

export default makeGitHubConnection;
