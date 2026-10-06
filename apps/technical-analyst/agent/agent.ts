/**
 * eve manifest for the Technical Analyst.
 *
 * One agent, two native schedules, two real business tools. The model
 * is locked to MiniMax (`@ai-sdk/minimax`) per the Phase 2 plan.
 *
 * `defaultTools: false` turns off eve's optional defaults (bash,
 * read_file, write_file, web_fetch, web_search, load_skill, agent).
 * The agent's only authored tools are `collect_activity` and
 * `submit_digest`. Connection-driven tools stay available when a
 * connection is configured (none today).
 *
 * Vercel Cron entries are generated from `agent/schedules/*.ts` —
 * no manual `vercel.json` cron block is needed.
 */
import { defineAgent } from "eve";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { minimax } from "@ai-sdk/minimax";

import { env } from "./env.ts";

const model: LanguageModelV4 = minimax(env.LLM_MODEL_ID);

export default defineAgent({
  model,
  defaultTools: false,
});