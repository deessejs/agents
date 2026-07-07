---
name: project-telegram-bots
description: Telegram bot @handles wired into ds-team agents (which domain maps to which bot)
metadata:
  type: project
---

Telegram bots registered against the ds-team eve agents (as of 2026-07-07):

| Agent | Vercel domain | Telegram @handle |
|---|---|---|
| head-of-product | `deessejs-hop-agent.nesalia.com` | `@deessejs_hop_bot` |
| head-of-engineering | `deessejs-hoe-agent.nesalia.com` | `@deessejs_hoe_bot` |

(Correction: as of 2026-07-07 the engineering agent was renamed from `cto-agent.nesalia.com` to `deessejs-hoe-agent.nesalia.com` to follow the same naming pattern as the product agent. Telegram webhooks must be re-registered whenever the underlying domain changes.)

The webhook URLs follow `https://<domain>/eve/v1/telegram`. Token + secret + @handle live in `apps/<name>/.env` (gitignored) and must be mirrored in the Vercel project's Environment Variables.

The shared channel factory at `packages/agent-core/src/channels/telegram.ts` reads TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET_TOKEN / TELEGRAM_BOT_USERNAME at startup and throws with a clear message if any is missing — so a half-configured Vercel project surfaces the error loud and early on the first deploy.

**Why:** These bots are how the user reaches each agent from outside a terminal — the channels are not interchangeable with the CLI `eve <url>` access.

**How to apply:** When asked about messaging either agent from Telegram or building a new channel integration, the bot @handles above are the entry points. If a new bot is added later, mirror the same three-env-var pattern and register its webhook with `setWebhook` against `https://<new-domain>/eve/v1/telegram`.
