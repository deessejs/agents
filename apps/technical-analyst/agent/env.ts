/**
 * @workspace/env schema for the Technical Analyst.
 *
 * Composes the shared schemas (@workspace/env/schemas/*) with the
 * agent-specific keys (digest cadences, recipient, sending domain,
 * etc.). All fields locked 2026-10-06 per the Phase 2 plan.
 *
 * Used by every agent module: schedules, lib/*, app/api/cron/*.
 */
import { z } from "zod";
import { createEnv } from "@workspace/env";
import { baseSchema } from "@workspace/env/schemas/base";
import { vercelSchema } from "@workspace/env/schemas/vercel";
import { githubSchema } from "@workspace/env/schemas/github";
import { resendSchema } from "@workspace/env/schemas/resend";

/**
 * Agent-specific keys. Composed AFTER the shared schemas so that
 * `.strict()` on the base layer is preserved.
 */
const technicalAnalystSchema = baseSchema
  .extend(vercelSchema.shape)
  .extend(githubSchema.shape)
  .extend(resendSchema.shape)
  .extend({
    // ── Agent identity (locked 2026-10-06) ────────────────────────────
    /** GitHub org the agent monitors. */
    GITHUB_ORG: z.string().min(1),
    /**
     * GitHub repo to summarize (Phase 2 v1 — single-repo scope; v2 will
     * iterate over `getOrgRepos` to cover the full org).
     */
    GITHUB_REPO: z.string().min(1),
    /** Single-recipient email for v1. */
    DIGEST_RECIPIENT: z.email(),

    // ── Sending identity (locked) ──────────────────────────────────────
    /** Subdomain of the org; recipient sees `digest@mail.<domain>`. */
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

    // ── Cadence (UTC crons; locked 22:00 Paris daily, ~18:00 Friday) ─
    /** Daily cron expression. */
    DAILY_CRON: z.string().default("0 20 * * *"),
    /** Weekly cron expression. */
    WEEKLY_CRON: z.string().default("0 16 * * 5"),
    /** Local timezone for the freshness timestamp only. */
    DAILY_LOCAL_TIMEZONE: z.string().default("Europe/Paris"),

    // ── Cron security ──────────────────────────────────────────────────
    /** Bearer token for the cron route handler. */
    CRON_SECRET: z.string().min(32),

    // ── LLM provider ───────────────────────────────────────────────────
    /** Model id; defaults to MiniMax-m3 via @workspace/llm. */
    LLM_MODEL_ID: z.string().default("minimax-m3"),

    // ── Vercel KV (used directly — no @workspace/cache wrapper) ───────
    KV_REST_API_URL: z.string().url(),
    KV_REST_API_TOKEN: z.string().min(1),

    // ── Optional kill-switch ───────────────────────────────────────────
    AGENTS_PAUSED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // ── Local dev (Mailpit) — never set in prod ────────────────────────
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const env = createEnv(technicalAnalystSchema);
export type Env = typeof env;
