/**
 * @workspace/env schema for the Technical Analyst.
 *
 * Composes the shared schemas (@workspace/env/schemas/*) with the
 * agent-specific keys (recipient, sending identity, model id). All
 * fields locked 2026-10-06 per the Phase 2 plan.
 *
 * **Passthrough:** the final object is `.passthrough()` (not `.strict()`)
 * so unrelated deployment variables (`VERCEL_*`, `NODE_ENV`, `PORT`,
 * etc.) are ignored instead of rejected. The agent declares only the
 * keys it needs; runtime platforms add their own.
 *
 * **v1 scope:** minimal surface. No KV, no LLM_PROVIDER enum, no
 * List-Unsubscribe env. The single provider is MiniMax and the single
 * recipient is `DIGEST_RECIPIENT`.
 */
import { z } from "zod";
import { createEnv } from "@workspace/env";
import { baseSchema } from "@workspace/env/schemas/base";
import { githubSchema } from "@workspace/env/schemas/github";
import { resendSchema } from "@workspace/env/schemas/resend";

const technicalAnalystSchema = baseSchema
  .extend(githubSchema.shape)
  .extend(resendSchema.shape)
  .extend({
    /** GitHub repo to summarize (single-repo v1 scope). */
    GITHUB_REPO: z.string().min(1),
    /** Single-recipient email for v1. */
    DIGEST_RECIPIENT: z.email(),

    /** Model id passed to the MiniMax provider. */
    MINIMAX_API_KEY: z.string().min(1),
    LLM_MODEL_ID: z.string().default("minimax-m3"),

    /** Kill-switch checked BEFORE collection starts and re-checked at submit. */
    AGENTS_PAUSED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .passthrough();

export const env = createEnv(technicalAnalystSchema);
export type Env = typeof env;
