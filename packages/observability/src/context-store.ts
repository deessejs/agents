/**
 * AsyncLocalStorage binding for the current agent run context.
 *
 * We expose a single module-level store rather than instantiating one per call
 * site so that `withAgentContext` always finds the active context regardless of
 * where in the call stack a logger is built.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { AgentContext } from "./types.ts";

/**
 * The full context record plus an optional reference to the AgentContext fields
 * that should be merged onto every log line within the scope.
 */
export interface ContextStoreValue {
  /** Raw context provided to `withAgentContext`. */
  raw: AgentContext;
}

export const agentContextStorage = new AsyncLocalStorage<ContextStoreValue>();

/**
 * Read the currently active context, or `undefined` if no
 * `withAgentContext` scope is active on this async chain.
 */
export function getActiveContext(): AgentContext | undefined {
  return agentContextStorage.getStore()?.raw;
}
