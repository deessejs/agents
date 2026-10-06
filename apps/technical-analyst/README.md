# `apps/technical-analyst`

The first eve agent: an automated engineering digest of GitHub activity for `env.GITHUB_ORG`, sent by email daily + weekly.

Built on the Phase 1 + Phase 2 shared packages:

- `@workspace/env` — Zod-validated env at boot (this file's `env.ts`)
- `@workspace/llm` — MiniMax / Anthropic wrapper, prompt caching, telemetry
- `@workspace/observability` — pino logger + OTel traces + agent context
- `@workspace/github` — Octokit + throttling + 13+ schemas
- `@workspace/format` — `escapeHtml`, `BANNED`, date/number/bytes/percent helpers
- `@workspace/email` — Resend wrapper + React Email templates

## Workflow (per cron tick)

```
1. Boot (agent/lib/digest.ts:runDailyDigest)
   - validate env (already at module load)
   - check kill-switch (kv.get("agents:paused"))
   - check last_successful_run:<kind> in KV — abort if today is recorded
   - compute digestId = sha256(org|window|kind).slice(0, 8)
2. Fetch (agent/lib/fetch.ts:fetchDailyData)
   - critical security endpoints: Promise.all, bypass p-limit
   - non-critical: p-limit(4)
3. Compose (agent/lib/compose.ts:composeDailyDigest)
   - generateObject with DailyDigestSchema (strict Zod, BANNED pre-check)
   - telemetry: { functionId: "compose-daily-digest", ... }
4. Render + Send (agent/lib/email.ts:renderAndSendDigest)
   - React Email template via @workspace/email
   - Resend with RFC 8058 List-Unsubscribe + idempotency key
```

## Schedules

| File                              | Cron (UTC)            | Local time                        | Window           |
| --------------------------------- | --------------------- | --------------------------------- | ---------------- |
| `agent/schedules/daily-digest.ts` | `0 20 * * *` (locked) | 22:00 Paris summer / 21:00 winter | previous UTC day |
| `agent/schedules/weekly-recap.ts` | `0 16 * * 5` (locked) | 18:00 Paris summer / 17:00 winter | Mon-Fri          |

The schedules use eve's `defineSchedule({ cron, markdown })` fire-and-forget form. The actual workflow runs via the route handlers at `app/api/cron/{daily-digest,weekly-recap}/route.ts`.

## Route handlers

- `app/api/cron/daily-digest/route.ts` — `GET`, `maxDuration=60`
- `app/api/cron/weekly-recap/route.ts` — `GET`, `maxDuration=90`

Both verify the `Authorization: Bearer ${CRON_SECRET}` header (per the runtime doc §4.6 3e-round FIX 2 — the CRON_SECRET check lives ONLY in the route handler, not inside `runDailyDigest`).

## Skills

| Skill                  | File                                         | Used by  |
| ---------------------- | -------------------------------------------- | -------- |
| `writing-quality`      | `agent/skills/writing-quality/SKILL.md`      | all runs |
| `digest-format-daily`  | `agent/skills/digest-format-daily/SKILL.md`  | daily    |
| `digest-format-weekly` | `agent/skills/digest-format-weekly/SKILL.md` | weekly   |

## Adversarial fixtures

`tests/fixtures/adversarial-pr-titles.json` ships 10 hostile payloads (prompt injection, XSS, malicious URLs, control chars, fake instructions). The CI test `tests/adversarial-pr-titles.test.ts` pins the BANNED regex from `@workspace/format` to catch every payload.

## Quality gates

- `pnpm --filter agent-technical-analyst run check` — lint + format
- `pnpm --filter agent-technical-analyst run typecheck` — tsc --noEmit
- `pnpm --filter agent-technical-analyst run test` — vitest run
- All three must be green before any PR is mergeable.

## Local dev (Mailpit)

```bash
docker run -p 1025:1025 -p 8025:8025 axllent/mailpit
# In .env: SMTP_HOST=localhost SMTP_PORT=1025
# (The agent currently sends via Resend; Mailpit is the target for
# Phase 3's dev-mode send adapter.)
```

## What this agent does NOT do (v1)

- No multi-recipient digests (deferred to v2).
- No inbound email channel — the digest is one-way.
- No auto-fixing of issues/PRs/alerts.
- No non-GitHub data sources (Linear, PagerDuty, Datadog, Sentry).
- No streaming for the weekly digest (v1 uses one `generateObject` call).
- No Resend webhook receiver (v2).
- No auto-suppression on bounce (v2).

## License

MIT
