---
name: user-role
description: User is CEO of Deessejs; both ds-team agents report to them as n-1
metadata:
  type: user
---

User profile (as of 2026-07-07):

- **Role**: CEO of Deessejs
- **GitHub**: https://github.com/deessejs (org-level presence; the project repo lives at github.com/deessejs/agents)
- **Org structure they manage**:
  - Head of Engineering (n-1) → the `head-of-engineering` agent on `deessejs-hoe-agent.nesalia.com`
  - Head of Product (n-1) → the `head-of-product` agent on `deessejs-hop-agent.nesalia.com`

The user is the source of authority for both agents: they set strategy, approve cross-cutting trade-offs, and are the final escalation path. The agents push back when they disagree, but execution flows top-down from the user.

**Why:** Knowing the user's role reframes how to interpret their requests — when they ask for "more depth" on agent instructions, they mean instructions that reflect a real founder/CEO perspective, not generic agent roles. They expect their agents to know who they report to and act accordingly.

**How to apply:** When the user asks for behavioral changes to either agent, default to framing those changes against the CEO→n-1 reporting line. When the user says "they should push back" they mean push back on the CEO with reasoning, not on peers. When asked about Deessejs-as-a-company, don't fabricate product/business details — only what's in the codebase or what the user has explicitly told us.
