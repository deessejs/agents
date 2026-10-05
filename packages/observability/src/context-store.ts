/**
 * AsyncLocalStorage binding for the current agent run context.
 *
 * We expose a single module-level store rather than instantiating one per call
 * site so that `withAgentContext` always finds the active context regardless of
 * where in the call stack a logger is built.
 *
 * The store itself is intentionally NOT re-exported from the package entry —
 * only `getActiveContext` and the `runInContext` bridge are accessible to the
 * rest of the package.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { AgentContext } from "./types.ts";

/**
 * Module-level store. `withAgentContext` writes here; `wrapPino` reads via
 * {@link getActiveContext}. Kept module-private — callers must use
 * `withAgentContext` rather than manipulating the store directly.
 */
const agentContextStorage = new AsyncLocalStorage<AgentContext>();

/**
 * Read the currently active context, or `undefined` if no
 * `withAgentContext` scope is active on this async chain.
 */
export function getActiveContext(): AgentContext | undefined {
  return agentContextStorage.getStore();
}

/**
 * Internal bridge used by `withAgentContext` to enter a scoped context. The
 * store itself is module-private; this is the only sanctioned way to write
 * to it. Lives here (rather than in `with-context.ts`) so both modules
 * share a single AsyncLocalStorage instance.
 */
export function runInContext<T>(ctx: AgentContext, fn: () => Promise<T>): Promise<T> {
  return agentContextStorage.run(ctx, fn);
}
