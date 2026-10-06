/**
 * @workspace/env schema for the Technical Analyst.
 *
 * Composes the shared schemas (@workspace/env/schemas/*) with the
 * agent-specific keys (recipient, sending domain, model id). All
 * fields locked 2026-10-06 per the Phase 2 plan.
 *
 * Used by the agent's tools and schedules.
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
    // ── Agent identity (locked 2026-10-06) ────────────────────────────
    /** GitHub org the agent monitors. */
    GITHUB_ORG: z.string().min(1),
    /**
     * GitHub repo to summarize (v1 — single-repo scope; future work
     * will iterate over `getOrgRepos` to cover the full org).
     */
    GITHUB_REPO: z.string().min(1),
    /** Single-recipient email for v1. */
    DIGEST_RECIPIENT: z.email(),

    // ── Sending identity (locked) ──────────────────────────────────────
    /** Sender address — recipient sees `digest@mail.<domain>`. */
    RESEND_FROM_ADDRESS: z.email(),
    /** Display name for the From: line. */
    RESEND_FROM_NAME: z.string().default("Technical Analyst"),
    /** Reply-To address (typically a monitored inbox, not no-reply). */
    RESEND_REPLY_TO: z.email().optional(),

    // ── List-Unsubscribe (RFC 8058) ─────────────────────────────────────
    /** HTTPS unsubscribe endpoint base URL. */
    UNSUBSCRIBE_BASE_URL: z.url(),
    /** mailto: unsubscribe address. */
    UNSUBSCRIBE_MAILTO: z.email(),

    // ── LLM provider ───────────────────────────────────────────────────
    /** Model id; defaults to MiniMax-m3 via @ai-sdk/minimax. */
    LLM_MODEL_ID: z.string().default("minimax-m3"),

    // ── Optional kill-switch ───────────────────────────────────────────
    AGENTS_PAUSED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .strict();

export const env = createEnv(technicalAnalystSchema);
export type Env = typeof env;