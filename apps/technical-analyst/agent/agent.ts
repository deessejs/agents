/**
 * eve manifest for the Technical Analyst.
 *
 * One agent, two native schedules, two real business tools. The
 * provider is MiniMax (locked 2026-10-06). Credentials are read
 * directly from `env.MINIMAX_API_KEY` so deployments can swap
 * providers without changing code.
 *
 * `defaultTools: false` turns off eve's optional defaults (bash,
 * read_file, write_file, web_fetch, web_search, load_skill, agent).
 * The agent's only authored tools are `collect_activity`,
 * `submit_digest`, and the opt-in `no_reply`. Connection-driven
 * tools stay available when a connection is configured (none
 * today).
 *
 * Vercel Cron entries are generated from `agent/schedules/*.ts` —
 * no manual `vercel.json` cron block is needed.
 */
import { defineAgent } from "eve";
import { minimax } from "@ai-sdk/minimax";

import { env } from "./env.ts";

export default defineAgent({
  model: minimax(env.LLM_MODEL_ID),
  defaultTools: false,
});
