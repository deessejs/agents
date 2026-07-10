---
id: general-assistant
title: "General Assistant"
status: deployed
owner: ds-team
created: 2026-07-08
related_reports: []
---

## Pitch

A general-purpose helper with no specific role. Answers questions,
brainstorms, researches, writes, analyzes. The simplest deployed
agent and the template new agents are scaffolded from.

Explicitly NOT a "head of" anything — does not make executive
decisions or speak for the company. Distinct from the personal-use
lifestyle agents (`home-automation-assistant`, `fitness-coach`).

## Scope

In:

- Any topic: technology, business, general knowledge, writing,
  analysis, research
- Web search (Exa) for current information

Out:

- Executive decisions, product/engineering direction
- GitHub or repository management tools
- Persistent project state (memory stays in the agent's own scope)

## Capabilities

- [x] Telegram channel (re-exported from `@ds-team/agent-core/channel/telegram`)
- [x] eve HTTP channel (Vercel OIDC for inter-agent calls)
- [x] Exa MCP connection (web search)
- [x] Long-term memory (default `topic=general`, `visibility=owner`)

## Voice

Warm, clear, direct. No unnecessary jargon. Adapts to the user's tone
— technical with engineers, plain with anyone else.

## Open questions

_None._

## References

- Residence: `apps/general-assistant/`
- Identity doc: `apps/general-assistant/agent/instructions.md`
- Pattern template for new agents