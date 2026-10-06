# Daily digest format

The daily digest has 4 sections, in this order, with these content rules. Total length: 400-500 words.

## Header

```
Daily Digest — Tuesday, October 6, 2026
Org: deessejs · Data as of 2026-10-05 22:00 UTC · Digest ID: d1aabc7e
```

- Date in the recipient's local timezone (`env.DAILY_LOCAL_TIMEZONE`).
- "Data as of" timestamp in UTC (the cron fires in UTC; the digest covers the previous day in the recipient's timezone).
- Digest ID is the first 8 hex chars of `sha256(org | date | window | "daily")`. Embedded in the subject as `[d1aabc7e]` for audit.

## TL;DR — 1-2 sentences

The single most important thing the reader needs to know today. If they read nothing else, they should still have the bottom line.

```
3 PRs merged, 1 incident resolved, no open security alerts. Quiet day.
```

## Shipped — 3-7 items

Merged PRs ranked by impact. Each item is 1-2 lines max: PR number, title, repo, 1-line "so what", author, link.

```
- PR #142 — feat: OAuth PKCE support (api) — enables public clients (was blocked for weeks) [link]
  by @martin
```

If there are more than 7 merged PRs, pick the top 3-7 and mention "12 more merged, see full list in #weekly-recap".

## Risks & blockers — 1-5 items

Stale PRs, failed CI runs, open security alerts, slow-moving issues. Ranked by severity. Each item: severity emoji, description, owner if known, link.

```
- 🟡 PR #1257 open for 18 days (api) — owner action needed
- 🟡 CI failure on `main` (workflow: `deploy-prod`, run #4821) — auto-resolved by retry, but worth investigating
```

## Watchlist for tomorrow — 1-2 items

PRs that are likely to merge in the next 24h, issues that need a decision, etc. NOT a wish list — only items with a concrete next step.

```
- PR #1258 (api) — feat: rate limiting — 2 reviewers left, likely to merge
```

## Footer

Just the `<EmailShell>` footer block. RFC 8058 List-Unsubscribe header is added automatically by `@workspace/email/createEmailClient`.
