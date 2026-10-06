# Weekly digest format

The weekly digest has 7 sections, in this order, with these content rules. Total length: 600-800 words (1 page max).

## Header

```
Weekly Digest — Week of Sep 29 to Oct 5, 2026
Org: deessejs · Data as of 2026-10-05 16:00 UTC · Digest ID: a7f12b3c
```

## TL;DR — 3 bullets

Three bullets: one number (top-line), one risk with name + ticket, one positive counter-balance.

```
- 38 PRs merged, up 22% week-over-week.
- 🟡 4 Dependabot criticals open for >7 days (api) — owner action needed.
- 🟢 Cycle time down 20% to 1.6 days, the lowest in 4 weeks.
```

## Shipped — 3-7 items

Top PRs of the week, ranked by impact. Each: PR number, title, repo, 1-line "so what", link.

## In progress — 3-5 items

Active work (open PRs with recent activity, in-flight initiatives). Each: % complete or ETA, owner, link.

```
- 🟡 Migration to Postgres 16 (infra) — 80% complete, owner @alice, target 2026-10-12
```

## Risks & blockers

Same format as the daily, but the window is Monday-Friday. Combine any item that recurred across the week.

## Key metrics — week-over-week table

A `<MetricsTable>` with these rows (one per DORA metric):

| Metric             | This wk | Last wk | Trend   |
| ------------------ | ------- | ------- | ------- |
| PRs merged         | 38      | 31      | up      |
| Cycle time (med)   | 1.6d    | 2.0d    | down ok |
| Lead time          | 3.2d    | 3.5d    | down ok |
| Deployments        | 14      | 11      | up      |
| Change fail rate   | 6%      | 4%      | up bad  |
| MTTR               | 2.1h    | 1.4h    | up bad  |
| Dependabot open    | 7       | 4       | up bad  |
| Code scanning open | 12      | 11      | flat    |
| Incidents opened   | 2       | 4       | down ok |

Each row's `tone` (good / bad / neutral) drives the color.

## Trends — what changed week-over-week

A few sentences on the bigger story. NOT a list of metrics (those are in the table). Examples:

- "Deploys picked up mid-week after the platform team unblocked the prod pipeline."
- "Two outages correlated with the same upstream API — worth filing a follow-up."

## Decisions needed

Anything where the reader (operator) needs to make a call. Maximum 3 items. If there are no decisions, omit the section.

## Next week focus — 3-5 priorities

What the reader should pay attention to. Operator-facing, not team-facing.

```
- Ship the Postgres 16 migration (infra).
- Triage the 4 Dependabot criticals older than 7 days.
- Review the postmortem from Thursday's incident.
```

## Skip-if-empty

If the week had no merged PRs, no incidents, and no alerts, **send a 200-word "low activity" digest** instead of the full 7-section format. Lead with: "Low activity week — N days with no merged PRs." Mention any maintenance work (dependency bumps, refactors) that did land.
