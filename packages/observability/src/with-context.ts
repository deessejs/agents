/**
 * `withAgentContext` — run-scoped tagging via `AsyncLocalStorage`.
 *
 * Every log line emitted inside the callback gets the standard `agent.*` tags
 * taken from `ctx` automatically, without callers having to pass them around
 * explicitly. GenAI semantic conventions set on `ctx.genai` are projected
 * onto every log line as `gen_ai.*` tags so dashboards built against the
 * OpenTelemetry GenAI spec render correctly out of the box.
 */

import { runInAgentContext, type ContextStoreValue } from "./context-store.ts";
import { createLogger } from "./create-logger.ts";
import type { AgentContext, Logger, LoggerConfig } from "./types.ts";

/**
 * Run `fn` with the given agent context attached to the current async chain.
 * Logs emitted inside `fn` will include the canonical `agent.*` tags and
 * (when `ctx.genai` is set) the OpenTelemetry GenAI tags. Logs emitted
 * outside the callback will not.
 *
 * Exceptions thrown from `fn` propagate normally and the context is cleaned up
 * automatically because `AsyncLocalStorage` is scoped to the callback.
 *
 * @example
 * ```ts
 * import { withAgentContext } from "@workspace/observability";
 * import { env } from "../env";
 *
 * await withAgentContext(
 *   {
 *     agent: "agent-technical-analyst",
 *     run_id: crypto.randomUUID(),
 *     schedule: "daily-digest",
 *     genai: { provider: "anthropic", operation: "chat", model: "claude-sonnet-4-5" },
 *   },
 *   async (log) => {
 *     log.info("digest composed");
 *   },
 *   { level: env.LOG_LEVEL, env: env.NODE_ENV },
 * );
 * ```
 */
export async function withAgentContext<T>(
  ctx: AgentContext,
  fn: (logger: Logger) => Promise<T>,
  loggerConfig: Partial<LoggerConfig> = {},
): Promise<T> {
  const config: LoggerConfig = {
    agent: ctx.agent,
    ...loggerConfig,
  };
  const logger = createLogger(config);
  const storeValue: ContextStoreValue = { raw: ctx };
  return runInAgentContext(storeValue, async () => fn(logger));
}
