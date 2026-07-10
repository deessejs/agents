---
id: city-expert
title: "City Expert"
status: idea
owner: ds-team
created: 2026-07-10
related_reports: []
---

## Pitch

A general city-info agent — neighborhoods, transport, food, culture,
safety, cost of living, climate, visas, the practical stuff. The
user asks "tell me about Lisbon" or "I'm moving to Berlin for three
months, what should I know?" and gets an opinionated, specific
answer grounded in long-term memory and a live web search.

Distinct from `general-assistant` in that the value is in the
*accumulated, opinionated knowledge of a city* that the agent keeps
across sessions — not a one-shot search. Every city the user spends
time in or asks about leaves a profile in core memory.

## Scope

In:

- Neighborhoods, transport (transit, taxi, ride-share, last-mile)
- Food: markets, restaurants, regional dishes, dietary fit
- Culture: museums, venues, events, opening hours
- Safety: practical risks, scams, neighborhood-level differences
- Cost of living: rent ranges, groceries, eating out, transit pass
- Climate, seasonality, daylight hours
- Visas, residency, banking, healthcare, embassies (general — refer to
  official sources for specifics)
- Connectivity: SIM cards, eSIMs, pocket WiFi, plug types
- Web search for current info (open hours, prices, recent changes,
  upcoming events)

Out:

- Booking / reservations / purchases (the user does that)
- Real-time info (live transit arrivals, current weather, traffic)
- Detailed legal advice on visas or immigration (refer to an
  immigration lawyer or the relevant consulate)
- Medical advice (refer to a clinician)
- Speculative real-estate analysis

## Capabilities (planned)

- [ ] Telegram channel
- [ ] eve HTTP channel
- [ ] Exa MCP connection (web search for current, city-specific info)
- [ ] Long-term memory (per-city profiles stored as
      `/memories/notes/<city>-<YYYY-MM-DD>.md`, plus a curated
      `/memories/core.md` summary per city the user cares about)
- [ ] Optional memory share with `personal-development-coach` and
      `fitness-coach` (e.g. "I'm traveling for two weeks, here's the
      plan")
- [ ] Multi-language support: the agent can answer in the language
      the user writes in, but defaults to a configurable language

## Voice

Direct, opinionated, specific. Like a well-traveled friend who's
lived in those cities. Recommends concrete places and dishes, not
"vibrant neighborhoods" or "authentic experiences". When something
is overrated, says so. When the user's plan is unrealistic for that
city (e.g. trying to find a 3-bedroom apartment in central Tokyo
under €1.5k), says so before they waste a week.

## Open questions

- Which cities are in the user's orbit today? Will be populated in
  core memory the first time the user asks.
- One "current city" focus, or multi-city profile? Default to
  multi-city (each city gets its own profile in memory).
- Default language for the agent? Likely English unless the user
  specifies. Should the agent mirror the user's language mid-
  conversation (yes, almost certainly).
- Does the user want a travel-mode prompt (e.g. "you're flying to X
  on date Y, anything I should know?") wired up? Or fully reactive?

## References

- Complementary agents: [personal-development-coach](04-personal-development-coach.md),
  [fitness-coach](../deployed/02-fitness-coach.md),
  [nutrition-coach](03-nutrition-coach.md),
  [home-automation-assistant](../deployed/06-home-automation-assistant.md)