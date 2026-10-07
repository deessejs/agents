# `@workspace/github`

> Thin Octokit wrapper that applies throttling, retry, and pagination plugins.

## Quick start

```ts
import { createGitHubClient } from "@workspace/github";

const gh = createGitHubClient({ auth: process.env.GITHUB_TOKEN! });

const response = await gh.raw.request("GET /repos/{owner}/{repo}/issues", {
  owner: "deessejs",
  repo: "agents",
  state: "open",
  per_page: 100,
});

for (const issue of response.data) {
  console.log(`#${issue.number}: ${issue.title}`);
}
```

Pagination is exposed via the underlying Octokit `paginate.iterator(...)`
field. The `Technical Analyst` agent rolls its own `listAll` walker on top
of it so the application can apply per-source caps and surface truncation
through availability metadata.

## Configuration

`createGitHubClient(config): GitHubClient`

| Field              | Type      | Default                    | Notes                                       |
| ------------------ | --------- | -------------------------- | ------------------------------------------- |
| `auth`             | `string`  | _(required)_               | Fine-grained PAT or GitHub App token.       |
| `throttling`       | `boolean` | `true`                     | Toggle the throttling plugin.               |
| `userAgent`        | `string`  | `"agents-studio"`          | Sent on every request.                      |
| `baseUrl`          | `string`  | `"https://api.github.com"` | Override for GitHub Enterprise.             |
| `requestTimeoutMs` | `number`  | `10_000`                   | Per-request timeout.                        |
| `retry.enabled`    | `boolean` | `true`                     | Toggle the retry plugin.                    |
| `retry.maxRetries` | `number`  | `3`                        | Max retries per request (transient errors). |

## Throttle behavior

The throttling plugin's `onRateLimit` callback caps primary rate-limit
retries at 3. `onSecondaryRateLimit` caps per-URL secondary retries at 5.
Both use the per-call `retryCount` argument exposed by
`@octokit/plugin-throttling` since v11; the wrapper does not keep its own
counter.

## v1 surface

The v1 package is intentionally thin — only `createGitHubClient` and the
underlying `Octokit` type are exported. No subpath imports, no helper APIs,
no schema re-exports. The agent app applies its own row projection and
truncation semantics; adding them back up would only serve new consumers.

## License

MIT
