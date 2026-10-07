# Deploying the Technical Analyst

Single Vercel project, one cron-driven agent. The project reads the
monorepo source so the workspace packages (`@workspace/env`,
`@workspace/github`, `@workspace/email`) are available at deploy time.

## Vercel project settings

| Setting           | Value                                |
| ----------------- | ------------------------------------ |
| Root Directory    | `apps/technical-analyst`             |
| Framework Preset  | Other                                |
| Build Command     | `eve build`                          |
| Install Command   | `pnpm install --frozen-lockfile`     |
| Output Directory  | leave default (eve writes `.eve/`)   |
| Node Version      | 24 (`.nvmrc` already pins this)      |
| Production Branch | project default (no override needed) |

Vercel runs `eve build` from the agent's package directory; the shared
workspace source is reachable because the install step resolves the
`workspace:*` protocol against the monorepo.

## Required environment variables

Set the production variables on the Vercel project. No other env
keys are needed.

| Variable              | Purpose                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`        | Fine-grained PAT, `contents:read` + `issues:read` + `pull_requests:read` + `actions:read` + `security_events:read` |
| `GITHUB_ORG`          | `deessejs`                                                                                                         |
| `GITHUB_REPO`         | `deessejs` (single-repo v1 scope)                                                                                  |
| `RESEND_API_KEY`      | `re_*` API key from a verified Resend domain                                                                       |
| `RESEND_FROM_ADDRESS` | A `digest@<your-verified-domain>` address                                                                          |
| `RESEND_FROM_NAME`    | `Technical Analyst` (display name)                                                                                 |
| `DIGEST_RECIPIENT`    | The single recipient email                                                                                         |
| `MINIMAX_API_KEY`     | MiniMax credential with model `m3` available                                                                       |
| `LLM_MODEL_ID`        | `minimax-m3` (default if unset)                                                                                    |
| `AGENTS_PAUSED`       | `false`                                                                                                            |

## GitHub permissions

The Vercel project's GitHub App only needs `contents:read` on the
target repo (`deessejs/deessejs`) to clone the monorepo. The
`GITHUB_TOKEN` is the runtime credential for the agent's API calls
— it is not a deployment token.

## Resend sender setup

1. Add the sending domain to Resend.
2. Verify the domain's DNS records.
3. Create an API key with `Sending: transactional-emails` only.
4. Set `RESEND_FROM_ADDRESS` to an address on the verified domain.

## Eve + Vercel cron

Eve generates the Vercel Cron config from each schedule's `cron` field
during `eve build`. The two schedules the agent ships with:

| File                              | Cron (UTC)   | Coverage                     |
| --------------------------------- | ------------ | ---------------------------- |
| `agent/schedules/daily-digest.ts` | `0 20 * * *` | previous UTC calendar day    |
| `agent/schedules/weekly-recap.ts` | `0 16 * * 5` | current ISO week (Mon → now) |

After `eve build` runs in production, the Vercel project settings
should show the two cron entries under Settings → Crons.

## Smoke test (one-shot)

After the first deploy:

1. Open the deployment in Vercel.
2. Click the daily-digest cron entry → "Trigger".
3. Watch the function logs for: collect → submit → `delivered`.
4. Confirm the email arrives at `DIGEST_RECIPIENT` with correct links
   and an availability block (if any source failed).

## Pause the agent

Set `AGENTS_PAUSED=true` in Vercel env. Both schedules short-circuit
before any fetch — no further emails are sent.

## Repo + daily-window product choice

- **Repository**: `deessejs/deessejs` (single-repo v1 scope).
- **Daily window**: previous UTC calendar day
  `[00:00:00Z, 00:00:00Z)`. A 20:00 UTC run reports yesterday's activity.
  Confirmed product choice for the launch.
