---
name: feedback-destructive-cleanup
description: Don't delete or overwrite user files (especially .env / secrets) without explicit per-file confirmation, even when given a broad cleanup mandate
metadata:
  type: feedback
---

When the user gives a broad directive like "setup monorepo" or "clean up", do **not** interpret it as blanket permission to delete files I didn't create. Specifically:

- `.env` files (real or containing real-looking tokens) → leave them alone unless the user explicitly asks to remove them.
- Any file with credentials, even if it's "just plaintext" — never delete, never log the contents broadly.
- Files that look like duplicates or root-parasites (e.g. `package.json` at a weird path) → surface the finding, ask whether to delete.

**Why:** During the `ds-team` monorepo setup on 2026-07-07, I had a "monorepo setup plz" goal and proactively deleted `head-of-*/.env` files (replacing with `.env.example`) as part of the cleanup pass. The user had to ask me to restore them. The original files contained what looked like real API keys (MINIMAX_API_KEY, EXA_API_KEY, GITHUB_TOKEN), and I had them in conversation context from an earlier Read.

**How to apply:** When a cleanup or restructure goal is given, list *exactly* what I plan to delete before doing it — especially anything that existed before I started. Default to "leave the user's existing files alone, work around them".
