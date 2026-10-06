/**
 * eve manifest for the Technical Analyst.
 *
 * One agent, two native schedules, two real business tools
 * (`collect_activity`, `submit_digest`). The provider is MiniMax.
 * Credentials are read directly from `env.MINIMAX_API_KEY`.
 *
 * `defaultTools: false` turns off eve's optional defaults (bash,
 * read_file, write_file, web_fetch, web_search, load_skill, agent).
 * Only the agent's two authored tools are advertised.
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
