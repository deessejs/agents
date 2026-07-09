---
description: Triage a GitHub issue on deessejs/errors — fetch, classify
  against the project taxonomy (type, status, priority, effort), and
  apply labels plus a Triage Review comment. Use when the user asks to
  triage, classify, label, or process an issue, or says "what status
  should #N be". Do NOT use to create new issues (use open-github-issue),
  to post free-form comments (phase 4-5), or to edit or close the issue.
  Always preview the label diff and the Triage Review comment before
  applying.
---

# Triage an issue on `deessejs/errors`

This skill mirrors the canonical triage procedure shipped at
[`deessejs/errors/.claude/skills/triage/SKILL.md`](https://github.com/deessejs/errors/blob/main/.claude/skills/triage/SKILL.md).
The taxonomy, decision tree, label-handling rules, and comment templates
here are the **contract**. Changes here should be made in lockstep with
the canonical source.

Copy this checklist and check off each step as you complete it:

Triage Progress:
- [ ] Step 1: Resolve the target (single issue or batch in `status: triage`)
- [ ] Step 2: Fetch per-issue detail with `github__issue_read`
- [ ] Step 3: Apply the decision tree (complete → valid → blocked)
- [ ] Step 4: Compute `add = candidates \ existing`; never remove
- [ ] Step 5: Compose the matching Triage Review comment
- [ ] Step 6: Preview the label diff + comment, wait for explicit OK
- [ ] Step 7: Apply `github__update_issue_labels` then `github__add_issue_comment`
- [ ] Step 8: Return the issue URL

## Required tools

Read:

- `github__list_issues` — batch search by label (used in single-issue mode only when the user says "triage the new ones")
- `github__issue_read({ ..., method: "get" })` — single-issue detail (title, body, state, labels)

Write (all three are gated by `user-approval` at the connection layer; Telegram renders that as inline-keyboard buttons — the user must OK every write):

- `github__update_issue_labels` — replaces the issue's label set with the provided list
- `github__add_issue_comment` — posts the Triage Review comment

`create_issue` is reachable but is for the `open-github-issue` skill, not for triage.

## Hard invariants

### From the canonical SKILL.md (do not violate)

Each rule ships with a *why* so the model can reason from intent, not just pattern-match.

1. **Always check existing labels before adding new ones.** Compute `add = candidates \ existing`. Without it the LLM double-applies labels that are already there and the user sees a flaky mutate-with-no-visible-effect.
2. **Add missing labels only — never remove.** A wrong user-added label is preserved — the taxonomy owner or the issue author often knows context you don't. Trust their hand-picked state; don't undo it silently.
3. **Preserve user intent.** A label that looks "wrong" may reflect cross-team context, an active incident, or a discussion that just resolved. The author has the full picture; you have one fetch.
4. **Respect existing status.** A pre-existing `status: ready` means another maintainer already validated this issue for pickup. Demoting it to `status: triage` (or `needs-info`) makes the work disappear from the queue without explanation.

### Skill-specific

5. **At most one `type:` label per issue.** If multiple candidates, keep the most specific.
6. **At most one `p?:` label per issue.**
7. **At most one `effort:` label per issue.**
8. **Skip a candidate label that does not exist in the repo today.** Surface the skip in the preview; do not fail the whole triage.
9. **Skip the issue entirely if its `state === "closed"`.** Triage of a closed issue is a contradiction.
10. **Comment footer must read** `*Triage by deessejs-errors-tech-lead via eve*` — distinct from the local sub-agent's footer so humans reading the GitHub UI know which surface acted.

## Taxonomy (canonical, partial inventory)

The full taxonomy is in the canonical SKILL.md. The repo today has **5 of 13** labels actually created. The skill works around the gap via invariant #8.

| Family | One required? | Values (created in repo / status) |
|---|---|---|
| `type:` | Yes | `type: bug` (no) · `type: feature` (yes) · `type: refactor` (no) · `type: docs` (no) · `type: chore` (yes) |
| `status:` | Yes | `status: triage` (yes) · `status: needs-info` (no) · `status: ready` (yes) · `status: blocked` (no) |
| `p?:` | No | `p0: critical` (no) · `p1: high` (no) · `p2: medium` (yes) · `p3: low` (yes) |
| `effort:` | No | `effort: xs` (yes) · `effort: s` (no) · `effort: m` (no) · `effort: l` (no) |
| Closure | No | `type: duplicate` (no) · `type: wontfix` (no) · `type: question` (no) |

## Procedure

### 1. Resolve the target

- If the user names a single issue (`triage #42`, `process issue 9`), use that number.
- If the user says "the new ones" or "everything in `status: triage`", fetch the batch:
  ```
  github__list_issues({
    owner: "deessejs",
    repo: "errors",
    state: "OPEN",
    labels: ["status: triage"]
  })
  ```

### 2. Fetch per-issue detail

For each target issue:
```
github__issue_read({
  owner: "deessejs",
  repo: "errors",
  issue_number: N,
  method: "get"
})
```

Read off: `title`, `body`, `state`, `labels` (existing).

### 3. Apply the decision tree

1. **Complete?** (all template fields filled)
   - No → `status: needs-info`
   - Yes → continue
2. **Valid task?** (not duplicate / question / wontfix)
   - No → closure label
   - Yes → continue
3. **Blocked?** (depends on another task)
   - Yes → `status: blocked` plus a reference to the blocker
   - No → `status: ready`

Add `p?:` and `effort:` labels when you have a defensible read. When in doubt, do not add them.

### 4. Compute the new label set

```
existing   = labels read off the issue
candidates = result of the decision tree, plus optional p? and effort
add        = candidates \ existing
new_labels = existing ∪ add       # set union, never remove
```

### 5. Compose the Triage Review comment

Pick the matching template below. Always close with the eve footer.

### 6. Preview

Show the user exactly what will be applied:

```
About to triage #42 on deessejs/errors.

  Existing labels:  [status: triage, type: feature]
  Will add:         [status: ready, p2: medium]
  Will NOT remove:  anything
  Will skip:        (none)

Comment to post:
---
## Triage Review
[…]
---
*Triage by deessejs-errors-tech-lead via eve*
---

Reply "OK" to apply, or send the corrections you want first.
```

For batch mode: one block per issue, then a single "apply all?" prompt. Cap preview at the first 5 issues; ask for "show more" if needed.

### 7. Apply after explicit OK

Two calls, in this order:

```
github__update_issue_labels({
  owner: "deessejs",
  repo: "errors",
  issue_number: N,
  labels: new_labels            # bare strings, no confidence wrapper
})
```

Then:

```
github__add_issue_comment({
  owner: "deessejs",
  repo: "errors",
  issue_number: N,
  body: "<Triage Review markdown>"
})
```

Both calls hit the connection-level `user-approval` gate. The user sees approve / deny buttons in Telegram. Apply only after both are confirmed.

### 8. Return

Reply with the issue's `html_url` and a one-line summary. Stop.

## Comment templates (footer replaced)

These are the canonical templates verbatim, with the footer replaced. Always match the template to the decision; do not invent hybrid forms.

### `status: ready`

```
## Triage Review

**Type:** `type: <type>`
**Status:** `status: ready` - All required information provided
**Priority:** `p?: <priority>` (if indicated)
**Effort:** `effort: <effort>` (if indicated)

**Decision:** <Brief explanation of why this issue is ready>

This issue contains all required information and is ready to be picked up.

---
*Triage by deessejs-errors-tech-lead via eve*
```

### `status: needs-info`

```
## Triage Review

**Status:** `status: needs-info` - Additional information required

**Decision:** This issue is missing required information and cannot be triaged yet.

**Missing fields:**
<list each missing required field from the issue template>

Please update the issue with the missing information so it can be properly triaged.

---
*Triage by deessejs-errors-tech-lead via eve*
```

### `type: duplicate`

```
## Triage Review

**Status:** `type: duplicate` - Duplicate of <issue number or link>

**Decision:** This issue appears to be a duplicate of an existing issue.

<If a related issue was found, mention it here>

---
*Triage by deessejs-errors-tech-lead via eve*
```

### `type: wontfix`

```
## Triage Review

**Status:** `type: wontfix` - Will not be addressed

**Decision:** After review, this issue does not align with current priorities or technical direction.

<Brief explanation of why it won't be addressed>

---
*Triage by deessejs-errors-tech-lead via eve*
```

### `type: question`

```
## Triage Review

**Status:** `type: question` - This appears to be a question

**Decision:** This issue seems to be a question rather than a task or bug report.

<If you can provide an answer, do so here. Otherwise, suggest using discussions.>

For questions, consider using GitHub Discussions instead of issues.

---
*Triage by deessejs-errors-tech-lead via eve*
```

### `status: blocked`

```
## Triage Review

**Type:** `type: <type>`
**Status:** `status: blocked` - Blocked by #<issue number>

**Decision:** This issue depends on work that is not yet complete.

**Blocking issue:** #<issue number> - <brief description>

Once the blocking issue is resolved, this can be moved to `status: ready`.

---
*Triage by deessejs-errors-tech-lead via eve*
```

## Notes

- **Always post a comment.** It lets the submitter understand the decision and gives future readers a paper trail.
- **Idempotency.** Re-running triage on the same issue preserves all labels and posts a fresh comment. The footer identifies which pass the comment came from.
- **Closed issues** (invariant #9) — decline politely and propose a different action (close-out review or reopen first).
- **Drift with the canonical SKILL.md.** If the canonical source changes (new label value, decision branch, template change), mirror here in the same PR.
- **No memory writes.** This skill does not write to `@ds-team/database`. Audit trail lives in the GitHub comment itself.
