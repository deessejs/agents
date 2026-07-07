import { defineRemoteAgent } from "eve";
import { vercelOidc } from "eve/agents/auth";

/**
 * Remote agent: Head of Product.
 *
 * Symmetric pairing to apps/head-of-product/agent/subagents/engineering.ts.
 * Exposed to the LLM as tool id `product`.
 */
export default defineRemoteAgent({
  url: "https://deessejs-hop-agent.nesalia.com",
  description:
    "Delegate to the Head of Product. Use this for prioritization decisions, scope-vs-outcome reasoning, user-impact framing, MVP scoping, and translating technical findings into priority calls. The remote agent has web search (Exa). Call it when an engineering question needs a product lens, or to settle a tradeoff between shipping speed and quality.",
  auth: vercelOidc(),
});
