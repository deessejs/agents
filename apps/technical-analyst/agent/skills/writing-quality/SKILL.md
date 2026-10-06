# Writing quality (shared)

These rules apply to **every** section of **every** digest. Load this skill at the start of every compose call.

## 1. BLUF (Bottom Line Up Front)

The first sentence of every section is the conclusion. No throat-clearing. The reader must be able to skim the first sentence and walk away with the point.

```
✗ "This week we saw 38 PRs merged, 4 incidents opened, and various activity across the org."
✓ "Cycle time is down 20% week-over-week, but Dependabot criticals tripled."
```

## 2. "So what"

Every item answers "why does this matter to the reader?" If it can't, cut it. The reader has 2-3 minutes for a daily digest and 7 minutes for a weekly.

```
✗ "PR #1234 — feat: payment retry"
✓ "PR #1234 — feat: payment retry (api) — reduces 3% failure rate in staging; will cut the 12 daily customer complaints about failed charges."
```

## 3. Quantify

Every metric is a number. Adjectives without numbers are opinions. Numbers without context are noise. Always pair them.

```
✗ "The team is faster."
✓ "Cycle time 1.6 days, down 20% from 2.0 days last week."
```

## 4. No vanity metrics

Never include stars, forks, lines of code, or commit count without context. "12,000 stars" is not a signal. "12,000 stars in a week, 80% from a Hacker News post" is.

## 5. No "all green"

Always search for yellow/red signals. If the digest reads as "all green", you missed something. Go back and look at:

- Failed CI runs in the window.
- Open alerts older than 7 days.
- Dependabot PRs that haven't been reviewed.
- Stale PRs (open > 7 days).
- Coverage / test trends if available.

## 6. RAG emoji only

Use 🟢 / 🟡 / 🔴 for status. No decorative emojis. The green is intentionally muted — your eye should find yellow and red first.

## 7. Links on every item

Every line points to an auditable source. The reader can click through and verify in <2 seconds. If you can't link it, don't include it.

## 8. Freshness timestamp

Every digest declares the data-cutoff timestamp at the top: `Data as of 2026-10-05 22:00 UTC`. The reader knows exactly what window the digest covers.

## 9. Honest failures

If a source was unavailable (GitHub 5xx, rate-limited, partial), say so explicitly. Never fabricate. The reader is making decisions on this data.

## 10. Length budget

- **Daily**: 400-500 words, 2-3 min read.
- **Weekly**: 600-800 words, 5-7 min read.
- **Section**: 50-100 words max.

If you're over budget, cut. Brevity is a feature.
