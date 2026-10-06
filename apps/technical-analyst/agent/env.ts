/**
 * @workspace/env schema for the Technical Analyst.
 *
 * Composes the shared schemas (@workspace/env/schemas/*) with the
 * agent-specific keys (recipient, sending domain, model id). All
 * fields locked 2026-10-06 per the Phase 2 plan.
 *
 * Used by the agent's tools and schedules.
 *
 * **Passthrough:** the final object is `.passthrough()` (not `.strict()`)
 * so unrelated deployment variables (`VERCEL_*`, `NODE_ENV`, `PORT`,
 * etc.) are ignored instead of rejected. The agent declares only the
 * keys it needs; runtime platforms add their own.
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
    /** AI SDK provider id (e.g. `"minimax"`). Used by `defineAgent`. */
    LLM_PROVIDER: z.enum(["minimax"]).default("minimax"),
    /** Model id passed to the provider (e.g. `"minimax-m3"`). */
    LLM_MODEL_ID: z.string().default("minimax-m3"),
    /**
     * Direct MiniMax / provider API key. Required when `LLM_PROVIDER`
     * is set; the agent reads it from this key rather than from any
     * SDK wrapper so deployments can swap providers without code.
     */
    MINIMAX_API_KEY: z.string().min(1),

    // ── Vercel KV (used for stable edition identity + run status) ──────
    KV_REST_API_URL: z.string().url(),
    KV_REST_API_TOKEN: z.string().min(1),

    // ── Optional kill-switch (checked BEFORE collection starts) ───────
    AGENTS_PAUSED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .passthrough();

export const env = createEnv(technicalAnalystSchema);
export type Env = typeof env;
