# @workspace/github

> Strictly-typed Octokit wrapper with throttling, retry, pagination, and Zod-validated response schemas.

## Elevator pitch

`createGitHubClient({ auth })` builds an Octokit instance with throttling,
retry, and pagination plugins applied. Helpers under
`@workspace/github/api/*` walk paginated endpoints, validate every row
against a Zod schema at the boundary, and apply optional in-memory
filters before returning typed entities. Throttle handlers cap primary
rate-limit retries at 3 and per-URL secondary retries at 5; rate-limit
state is exposed via `gh.getRateLimit()`.

## Install

Internal workspace package — add to `dependencies`:

```json
{
  "dependencies": {
    "@workspace/github": "workspace:*",
    "@octokit/core": "catalog:"
  }
}
```

## Quick start (30 lines)

```ts
import { createGitHubClient } from "@workspace/github";
import { getMergedPRs, getOpenPRs } from "@workspace/github/api/pulls";
import { getOpenIssues, getIssueTimeline } from "@workspace/github/api/issues";

const gh = createGitHubClient({ auth: process.env.GITHUB_TOKEN! });

// Cross-org merged-PR list for the last 7 days.
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const merged = await getMergedPRs(gh, { org: "octocat", since, max: 500 });

// Repo-scoped open issues.
const open = await getOpenIssues(gh, { org: "octocat", repo: "agents" });

// Issue timeline (labels, comments, closes).
const events = await getIssueTimeline(gh, {
  owner: "octocat",
  repo: "agents",
  issue_number: open[0].number,
});

// Live rate-limit info before launching the next batch.
const { remaining, reset, limit } = await gh.getRateLimit();
console.log(`${remaining}/${limit} remaining, resets at ${reset.toISOString()}`);
```

## API reference

### `createGitHubClient(config): GitHubClient`

Build the client. `config` fields:

| Field              | Type      | Default                    | Notes                                       |
| ------------------ | --------- | -------------------------- | ------------------------------------------- |
| `auth`             | `string`  | _(required)_               | Fine-grained PAT or GitHub App token.       |
| `throttling`       | `boolean` | `true`                     | Toggle the throttling plugin.               |
| `userAgent`        | `string`  | `"agents-studio"`          | Sent on every request.                      |
| `baseUrl`          | `string`  | `"https://api.github.com"` | Override for GitHub Enterprise.             |
| `requestTimeoutMs` | `number`  | `10_000`                   | Per-request timeout.                        |
| `retry.enabled`    | `boolean` | `true`                     | Toggle the retry plugin.                    |
| `retry.maxRetries` | `number`  | `3`                        | Max retries per request (transient errors). |

The returned `GitHubClient` exposes `raw` (the underlying Octokit),
`paginateAll`, and `getRateLimit`.

### `gh.paginateAll<T>(route, params?, opts?): Promise<T[]>`

Walk every page of `route` and return a flat array. The 3-arg signature
is the only public surface — call it as `gh.paginateAll(route)`,
`gh.paginateAll(route, params)`, or `gh.paginateAll(route, params, { max })`.
For endpoints covered by the `@workspace/github/api/*` helpers, validation
is applied inside the helper so callers receive already-typed entities;
use `gh.paginateAll` directly only when you need to paginate an endpoint
the helpers do not cover.

### `gh.getRateLimit(): Promise<RateLimitInfo>`

Read the current primary rate-limit state. Returns:

```ts
interface RateLimitInfo {
  remaining: number;
  reset: Date; // ISO-converted from unix seconds.
  limit: number;
}
```

## API helpers (subpath imports)

### `@workspace/github/api/pulls`

| Helper               | Endpoint                                   | Returns                  |
| -------------------- | ------------------------------------------ | ------------------------ |
| `getMergedPRs(opts)` | `GET /search/issues` or `/repos/.../pulls` | `Promise<PullRequest[]>` |
| `getOpenPRs(opts)`   | same                                       | `Promise<PullRequest[]>` |

### `@workspace/github/api/issues`

| Helper                   | Endpoint                         | Returns                    |
| ------------------------ | -------------------------------- | -------------------------- |
| `getOpenIssues(opts)`    | `/repos/.../issues` or search    | `Promise<Issue[]>`         |
| `getClosedIssues(opts)`  | same                             | `Promise<Issue[]>`         |
| `getIssueTimeline(opts)` | `/repos/.../issues/{n}/timeline` | `Promise<TimelineEvent[]>` |

### `@workspace/github/api/repos`

| Helper              | Endpoint                | Returns           |
| ------------------- | ----------------------- | ----------------- |
| `getOrgRepos(opts)` | `/orgs/{org}/repos`     | `Promise<Repo[]>` |
| `getRepo(opts)`     | `/repos/{owner}/{repo}` | `Promise<Repo>`   |

### `@workspace/github/api/security`

| Helper                          | Returns                          |
| ------------------------------- | -------------------------------- |
| `getDependabotAlerts(opts)`     | `Promise<DependabotAlert[]>`     |
| `getCodeScanningAlerts(opts)`   | `Promise<CodeScanningAlert[]>`   |
| `getSecretScanningAlerts(opts)` | `Promise<SecretScanningAlert[]>` |

### `@workspace/github/api/releases`

| Helper                   | Returns              |
| ------------------------ | -------------------- |
| `getReleases(opts)`      | `Promise<Release[]>` |
| `getLatestRelease(opts)` | `Promise<Release>`   |

### `@workspace/github/api/actions`

| Helper                    | Returns                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `getWorkflowRuns(opts)`   | `Promise<WorkflowRun[]>`                                     |
| `getFailedRuns(opts)`     | `Promise<WorkflowRun[]>` (filter `conclusion === "failure"`) |
| `getCommitActivity(opts)` | `Promise<CommitActivity[]>`                                  |

## Schemas reference

Every API entity is parsed through a Zod schema exported from
`@workspace/github/schemas`:

| Schema                      | Entity                | Notable constraints                                            |
| --------------------------- | --------------------- | -------------------------------------------------------------- |
| `PullRequestSchema`         | `PullRequest`         | `mergeable_state` enum (6 values + null)                       |
| `IssueSchema`               | `Issue`               | `state_reason` enum (`completed` / `reopened` / `not_planned`) |
| `TimelineSchema`            | `TimelineEvent`       | labeled/assigned/closed/commented/... (discriminated)          |
| `ReleaseSchema`             | `Release`             | `tag_name` 1–255 chars                                         |
| `WorkflowRunSchema`         | `WorkflowRun`         | `head_sha` 40-char hex; `event` lowercase                      |
| `DependabotAlertSchema`     | `DependabotAlert`     | `state` 5-value enum                                           |
| `CodeScanningAlertSchema`   | `CodeScanningAlert`   | `state` 5-value enum                                           |
| `SecretScanningAlertSchema` | `SecretScanningAlert` | `state` 7-value enum                                           |
| `RateLimitResponseSchema`   | `RateLimitResponse`   | `reset` capped at year 2100                                    |
| `RepoSchema`                | `Repo`                | `default_branch` validated as git ref                          |
| `LabelSchema`               | `Label`               | `color` 6-char hex                                             |
| `UserSchema`                | `User`                | `login` 1–39 chars; `type` enum                                |

All schemas use `.passthrough()` so live API additions land on the
parsed object without a schema bump.

## Throttle behavior

`defaultThrottleHandlers(opts?)` returns the handlers required by
`@octokit/plugin-throttling`.

| Callback               | Default cap | Per-URL? | Notes                                         |
| ---------------------- | ----------- | -------- | --------------------------------------------- |
| `onRateLimit`          | `3`         | no       | Per-call `retryCount` provided by the plugin. |
| `onSecondaryRateLimit` | `5`         | yes      | Module-tracked per `(method, url)` key.       |

The secondary-retry counter is bounded at 1,000 entries — the oldest
key is evicted on each insert so a long-lived client can't leak memory.
For tests, call `__resetSecondaryRetryForTests()` (exported from
`./throttle`) to forget all state.

## Rate limit usage

`getRateLimit()` returns a typed `RateLimitInfo`. A few patterns:

```ts
const { remaining, reset } = await gh.getRateLimit();
if (remaining < 10) {
  await new Promise((resolve) => setTimeout(resolve, reset.getTime() - Date.now()));
}
```

For per-route scoped rate limits (`/search/*` is 30 req/min), poll the
underlying `RateLimitResponse` schema via the raw Octokit:

```ts
import { RateLimitResponseSchema } from "@workspace/github/schemas/rate-limit";

const { data } = await gh.raw.request("GET /rate_limit");
const parsed = RateLimitResponseSchema.parse(data);
console.log(parsed.resources.search);
```

## Subpath map

| Subpath                                           | Source                                   |
| ------------------------------------------------- | ---------------------------------------- |
| `@workspace/github`                               | `./src/index.ts`                         |
| `@workspace/github/client`                        | `./src/client.ts`                        |
| `@workspace/github/schemas`                       | `./src/schemas/index.ts`                 |
| `@workspace/github/schemas/pull-request`          | `./src/schemas/pull-request.ts`          |
| `@workspace/github/schemas/issue`                 | `./src/schemas/issue.ts`                 |
| `@workspace/github/schemas/timeline-event`        | `./src/schemas/timeline-event.ts`        |
| `@workspace/github/schemas/release`               | `./src/schemas/release.ts`               |
| `@workspace/github/schemas/workflow-run`          | `./src/schemas/workflow-run.ts`          |
| `@workspace/github/schemas/user`                  | `./src/schemas/user.ts`                  |
| `@workspace/github/schemas/ref`                   | `./src/schemas/ref.ts`                   |
| `@workspace/github/schemas/rate-limit`            | `./src/schemas/rate-limit.ts`            |
| `@workspace/github/schemas/repo`                  | `./src/schemas/repo.ts`                  |
| `@workspace/github/schemas/label`                 | `./src/schemas/label.ts`                 |
| `@workspace/github/schemas/review`                | `./src/schemas/review.ts`                |
| `@workspace/github/schemas/action-job`            | `./src/schemas/action-job.ts`            |
| `@workspace/github/schemas/action-step`           | `./src/schemas/action-job.ts`            |
| `@workspace/github/schemas/datetime`              | `./src/schemas/datetime.ts`              |
| `@workspace/github/schemas/url`                   | `./src/schemas/url.ts`                   |
| `@workspace/github/schemas/dependabot-alert`      | `./src/schemas/dependabot-alert.ts`      |
| `@workspace/github/schemas/code-scanning-alert`   | `./src/schemas/code-scanning-alert.ts`   |
| `@workspace/github/schemas/secret-scanning-alert` | `./src/schemas/secret-scanning-alert.ts` |
| `@workspace/github/api/pulls`                     | `./src/api/pulls.ts`                     |
| `@workspace/github/api/issues`                    | `./src/api/issues.ts`                    |
| `@workspace/github/api/repos`                     | `./src/api/repos.ts`                     |
| `@workspace/github/api/security`                  | `./src/api/security.ts`                  |
| `@workspace/github/api/releases`                  | `./src/api/releases.ts`                  |
| `@workspace/github/api/actions`                   | `./src/api/actions.ts`                   |
| `@workspace/github/api/stats`                     | `./src/api/stats.ts`                     |
| `@workspace/github/throttle`                      | `./src/throttle.ts`                      |

## JSDoc imports

```ts
import {
  createGitHubClient,
  defaultThrottleHandlers,
  type GitHubClient,
  type GitHubClientConfig,
  type RateLimitInfo,
  type ThrottleHandlers,
} from "@workspace/github";

import { getMergedPRs, getOpenPRs } from "@workspace/github/api/pulls";
import { getIssueTimeline } from "@workspace/github/api/issues";
import { DependabotAlertSchema } from "@workspace/github/schemas/dependabot-alert";
```
