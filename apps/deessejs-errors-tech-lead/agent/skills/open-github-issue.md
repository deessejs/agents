---
description: Open a new GitHub issue on deessejs/errors using the project's
  .github/ISSUE_TEMPLATE/. Use when the user asks to file, open, or create
  a new issue: bug reports, feature requests, incidents, docs typos, chore
  tasks. Mirrors the templates the project ships. Do NOT use this skill to
  edit, comment on, label, or triage existing issues — those use the
  'triage' skill, or land in phase 4-5. Always preview before calling
  github__create_issue.
---

# Open a GitHub issue on `deessejs/errors`

Use this procedure exactly. Do not skip the preview.

Copy this checklist and check off each step as you complete it:

Issue Progress:
- [ ] Step 1: Confirm intent
- [ ] Step 2: List templates at `.github/ISSUE_TEMPLATE/`
- [ ] Step 3: Match user intent to a template (or confirm blank)
- [ ] Step 4: Read the chosen template
- [ ] Step 5: Gather values from the user
- [ ] Step 6: Preview the issue and wait for explicit OK
- [ ] Step 7: Call `github__create_issue`
- [ ] Step 8: Return the issue URL

## 1. Confirm intent

State in one short message what you understood the user wants filed. If
the request is ambiguous or could fit multiple kinds of issue (bug vs.
feature vs. question), ask before proceeding.

## 2. List the issue templates

Call `github__get_file_contents` with:

- `owner: "deessejs"`
- `repo: "errors"`
- `path: ".github/ISSUE_TEMPLATE/"`

Parse the response to enumerate template files. Skip `config.yml` and
any `.md` file that is not under `.github/ISSUE_TEMPLATE/`. For each
template, capture:

- Filename and relative path
- Format: `YAML form` (`.yml`) or `Markdown template` (`.md`)
- Title (from frontmatter `name:` for YAML; from frontmatter `name:` or
  first `#` heading for Markdown)
- Description (from frontmatter `description:`)

## 3. Match and confirm the template

Choose the template whose `name` / `description` best matches the user's
intent. If multiple match, ask the user which they meant. If none match,
propose a blank issue and confirm before continuing.

## 4. Read the chosen template

Call `github__get_file_contents` with the template's path.

- For **YAML forms**: parse the `body:` array. Each entry has a `type`
  (`markdown`, `input`, `textarea`, `dropdown`, `checkboxes`, `upload`),
  an `id`, `attributes.label`, optional `attributes.description`,
  optional `attributes.placeholder`, and optional `validations.required`.
  Reproduce this structure for the user as a list of fields to fill.
- For **Markdown templates**: strip frontmatter (`title`, `labels`,
  `assignees`, `type`, `projects`, …). Surface the body section by
  section. HTML comments like `<!-- placeholder -->` are fields.

## 5. Gather values from the user

For each required field, ask the user. Skip optional fields unless the
user wants to fill them. If a field has a `default` (e.g. a dropdown
with `default: 0`), surface it.

## 6. Preview the issue

Always show the user exactly what will be created, in this shape:

```
I'm about to create the following issue on deessejs/errors:

Title:     <title>
Labels:    [<labels>]
Assignees: [<assignees>]
Body:
---
<filled body>
---
Reply "OK" to confirm, or send the corrections you want first.
```

Wait for explicit confirmation. Do not call `github__create_issue`
without it. If the user asks for changes, loop back to step 5.

## 7. Create

After confirmation, call `github__create_issue` exactly once with:

- `owner: "deessejs"`
- `repo: "errors"`
- `title`: the title from the preview
- `body`: the body from the preview
- `labels`: the labels from the template frontmatter, plus an
  attribution label like `via-tech-lead` if the user wants it
- `assignees`: the assignees from the template frontmatter

Do not include `milestone` or `type` unless `deessejs/errors` has
configured GitHub Issue Types — verify before use, otherwise leave them
empty. Do not call any other write tool.

## 8. Return the URL

On success, return the issue's `html_url` to the user. Confirm with one
short line ("Issue #N created on deessejs/errors.") and stop. If the
call fails, surface the error verbatim, do not retry silently.
