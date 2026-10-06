/**
 * eve `agent.ts` for the Technical Analyst.
 *
 * `defineAgent` from `eve` configures the agent's runtime. The actual
 * workflow (`runDailyDigest`, `runWeeklyRecap`) is invoked by the
 * schedules under `agent/schedules/`; this file is the agent's
 * *manifest*, not its entry point.
 *
 * Reference: https://eve.dev/docs/reference/typescript-api (defineAgent)
 */
import { defineAgent } from "eve";
import { env } from "./env.ts";

/**
 * Model registry. Phase 2 ships a single model; the runtime doc
 * §4.4 specifies the v7 AI SDK's `telemetry` + `functionId` shape.
 *
 * Future: add a `@ai-sdk/bedrock` fallback for EU compliance (locked
 * 2026-10-06 — default is MiniMax US per the Phase 2 plan).
 */
const modelId = env.LLM_MODEL_ID; // e.g. "minimax-m3"

export default defineAgent({
  /**
   * The model id is read at boot from env so per-deploy swaps are
   * zero-config. The route handler in `app/api/cron/` sets its own
   * Vercel `maxDuration` (60 s for daily, 90 s for weekly).
   */
  model: modelId,
});
