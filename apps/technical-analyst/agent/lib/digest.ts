/**
 * Main entry point — `runDailyDigest({ kind: "daily" })`.
 *
 * Per the runtime doc §4.2 (the 3e-round "FIX 1, 2, 5, 8" annotations):
 *   - The CRON_SECRET check lives at the route handler, not here. We
 *     still validate that the secret is *configured* — a missing secret
 *     is an operator error and we want to fail fast.
 *   - `digestId` is computed once here from authoritative inputs
 *     (org + window ISO strings + kind) and threaded through to
 *     `renderAndSendDigest`. No divergent recomputation downstream.
 *   - The `last_successful_run:<kind>` dedup is read at the start
 *     and written on success.
 */
import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { withAgentContext, type Logger } from "@workspace/observability";
import { env } from "../env.ts";

import { fetchDailyData, type DailyData } from "./fetch.ts";
import { composeDailyDigest } from "./compose.ts";
import { renderAndSendDigest } from "./email.ts";
import { assertNotKilled } from "./errors.ts";

export interface RunOptions {
  kind: "daily" | "weekly";
  dryRun?: boolean;
}

/**
 * Loads the skills via fs (eve's `loadSkill` requires a session
 * context we don't have at unit-test time). Production callers should
 * use `loadSkill` from `eve/skills` to get the same content.
 */
async function loadSkills(): Promise<{ writingQuality: string; dailyFormat: string }> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const __filename = fileURLToPath(import.meta.url);
  const here = dirname(__filename);
  const skillsRoot = resolve(here, "..", "skills");
  const [writingQuality, dailyFormat] = await Promise.all([
    readFile(resolve(skillsRoot, "writing-quality", "SKILL.md"), "utf8"),
    readFile(resolve(skillsRoot, "digest-format-daily", "SKILL.md"), "utf8"),
  ]);
  return { writingQuality, dailyFormat };
}

export async function runDailyDigest(opts: RunOptions): Promise<{ messageId: string }> {
  const startedAt = Date.now();
  const rid = crypto.randomUUID();

  if (!env.CRON_SECRET) {
    throw new Error("CRON_SECRET is not configured (expected in env)");
  }

  return withAgentContext(
    {
      agent: "agent-technical-analyst" as const,
      run_id: rid,
      schedule: `${opts.kind}-digest` as const,
    },
    async (log: Logger) => {
      log.info("Starting daily digest");

      // Kill-switch check.
      await assertNotKilled(kv.get);

      // Last-successful-run dedup.
      const lastSuccessKey = `agent:${env.GITHUB_ORG}:last_success:${opts.kind}`;
      const today = new Date().toISOString().split("T")[0] ?? "";
      const lastSuccess = await kv.get<string>(lastSuccessKey);
      if (lastSuccess === today) {
        log.info("Already processed today, skipping", {
          last_success: lastSuccess,
          kind: opts.kind,
        });
        return { messageId: "skipped" };
      }

      // Compute the window: previous day in the recipient's local timezone.
      // For v1 we use the UTC previous calendar day (the cron fires
      // 22:00 Paris = 20:00/21:00 UTC, so the previous UTC day has
      // ended).
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

      // Phase 2: Fetch.
      const data: DailyData = await fetchDailyData({ start, end, log });

      // Compute digestId once from authoritative inputs.
      const digestId = createHash("sha256")
        .update(
          [
            data.org,
            data.window.start.toISOString(),
            data.window.end.toISOString(),
            opts.kind,
          ].join("|"),
        )
        .digest("hex")
        .slice(0, 8);

      log.info("Computed digestId", { digest_id: digestId, kind: opts.kind });

      // Phase 4: Compose.
      const skills = await loadSkills();
      const digest = await composeDailyDigest({
        data,
        skills,
        runId: rid,
        log: {
          // Cast `ctx` to the Logger's `Record<string, unknown>` shape.
          // The Logger type is wider than what `compose.ts` declares;
          // both are `object` at runtime.
          info: (msg, ctx) => log.info(msg, ctx as Record<string, unknown> | undefined),
          error: (msg, ctx) => log.error(msg, ctx as Record<string, unknown> | undefined),
        },
      });

      // Phase 5 + 6: Render and Send.
      const result = await renderAndSendDigest({
        digest,
        digestId,
        dryRun: opts.dryRun ?? false,
      });

      // Mark today as successfully processed. The `kv.set` signature
      // in @vercel/kv types the value as a JSON-serializable record;
      // we bypass that strictness because `today` is a plain string
      // and the wrapper handles the serialization internally.
      await kv.set(
        lastSuccessKey,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        today as any,
        { ex: 60 * 60 * 24 * 2 },
      );

      log.info("Daily digest sent", {
        message_id: result.messageId,
        digest_id: digestId,
        section_count: digest.sections.length,
        duration_ms: Date.now() - startedAt,
      });

      return { messageId: result.messageId };
    },
  );
}
