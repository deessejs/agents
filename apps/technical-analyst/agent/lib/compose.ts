/**
 * Phase 4 — Compose. Calls @workspace/llm's `generateObject` with the
 * `DailyDigestSchema` (strict Zod, BANNED pre-check, PR number /
 * URL cross-check).
 *
 * Per the runtime doc §4.4 + the locked Phase 2 plan:
 *   - `telemetry: { functionId: "compose-daily-digest", metadata: { agent, schedule, run_id, section } }`
 *   - The `system` array is a `withCaching` wrapped version of the skills
 *   - Output: validate via `validateAndEscape()`, then return
 *
 * The actual LLM call is delegated to `ai.generateObject` from the
 * AI SDK v7. The provider is resolved by `@workspace/llm` (defaults to
 * `@ai-sdk/minimax` with `minimax-m3`).
 */
import { generateObject } from "ai";

import { DailyDigestSchema, validateAndEscape, type DailyDigest } from "./digest-schema.ts";
import { model } from "./llm-client.ts";
import type { DailyData } from "./fetch.ts";

const PER_CALL_INPUT_TOKEN_CAP = 30_000;

export interface ComposeOptions {
  data: DailyData;
  /** Skills loaded via eve's `loadSkill` (markdown strings). */
  skills: {
    writingQuality: string;
    dailyFormat: string;
  };
  /** Per-run tag for the root OTel span. */
  runId: string;
  /** Structured logger (from @workspace/observability). */
  log: {
    info: (msg: string, ctx?: Record<string, unknown>) => void;
    error: (msg: string, ctx?: Record<string, unknown>) => void;
  };
}

export async function composeDailyDigest(opts: ComposeOptions): Promise<DailyDigest> {
  const { data, skills, log } = opts;

  // AI SDK v7 takes a plain `system: string` (no `[{ type: "text" }]`
  // array — that was the v4 shape). The cache-control mark is
  // applied by the @workspace/llm `withCaching` wrapper, not at
  // the call site. We pass the concatenated skills as a single
  // string. See @workspace/llm/src/cache.ts for the v7 cache key.
  const systemPrompt = `${skills.writingQuality}\n\n${skills.dailyFormat}`;

  const result = await generateObject({
    // The model() helper returns the right provider's handle; the
    // cast is needed because each provider exports a different
    // concrete type but the AI SDK's generateObject accepts both
    // structurally.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model() as any,
    schema: DailyDigestSchema,
    system: systemPrompt,
    prompt: [
      "Use only the GitHub data inside <github_data>. Do not invent PR numbers, URLs, or authors.",
      "Every item must include a verifiable link from the data set.",
      "",
      '<github_data role="data-only">',
      JSON.stringify({
        window: data.window,
        mergedPRs: data.mergedPRs,
        newIssues: data.newIssues,
        closedIssues: data.closedIssues,
        dependabot: data.openDependabotAlerts,
        codeScanning: data.openCodeScanningAlerts,
        secretScanning: data.openSecretScanningAlerts,
        failedRuns: data.failedWorkflowRuns,
        releases: data.newReleases,
      }),
      "</github_data>",
    ].join("\n"),
    maxOutputTokens: 1500,
    temperature: 0.3,
  });

  // DOC-FIX-3: cached input lives on
  // `result.providerMetadata.anthropic.usage.cacheReadInputTokens`.
  const usage = result.usage;
  const providerMeta = result.providerMetadata as
    | { anthropic?: { usage?: { cacheReadInputTokens?: number } } }
    | undefined;
  const cachedInputTokens = providerMeta?.anthropic?.usage?.cacheReadInputTokens ?? 0;
  const promptTokens = usage?.inputTokens ?? 0;
  const totalInput = cachedInputTokens + promptTokens;
  if (totalInput > PER_CALL_INPUT_TOKEN_CAP) {
    throw new Error(
      `Per-call input token cap exceeded: ${totalInput} > ${PER_CALL_INPUT_TOKEN_CAP} ` +
        `(cached=${cachedInputTokens}, prompt=${promptTokens})`,
    );
  }

  // C4: BANNED regex + strict parse (the strict parse happens inside
  // `generateObject`'s schema; BANNED is checked after the object is
  // returned, before render).
  const validated = DailyDigestSchema.safeParse(result.object);
  if (!validated.success) {
    log.error("Digest validation failed", { errors: validated.error.issues });
    throw new Error(`Daily digest failed validation: ${validated.error.message}`);
  }

  log.info("Composed daily digest", {
    sections: validated.data.sections.length,
    tokens: { prompt: promptTokens, completion: usage?.outputTokens, cached: cachedInputTokens },
  });

  return validateAndEscape(validated.data);
}
