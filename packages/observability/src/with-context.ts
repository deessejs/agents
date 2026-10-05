/**
 * `withAgentContext` — run-scoped tagging via `AsyncLocalStorage`.
 *
 * Every log line emitted inside the callback gets the standard `agent.*` tags
 * taken from `ctx` automatically, without callers having to pass them around
 * explicitly.
 */

import { agentContextStorage, type ContextStoreValue } from "./context-store.ts";
import { createLogger } from "./create-logger.ts";
import type { AgentContext, Logger, LoggerConfig } from "./types.ts";

/**
 * Run `fn` with the given agent context attached to the current async chain.
 * Logs emitted inside `fn` will include the canonical `agent.*` tags; logs
 * emitted outside will not.
 *
 * Exceptions thrown from `fn` propagate normally and the context is cleaned up
 * automatically because `AsyncLocalStorage` is scoped to the callback.
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
  return agentContextStorage.run(storeValue, async () => {
    return fn(logger);
  });
}
