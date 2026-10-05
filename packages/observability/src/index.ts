/**
 * Public API surface for `@workspace/observability`.
 *
 * Subpath exports (`./otel`, `./redact`, `./tags`, `./types`) live in their
 * own entry points; this index exports the most common helpers for
 * `import { createLogger, withAgentContext } from "@workspace/observability"`.
 *
 * Type re-exports are sourced from `./types.ts` directly so a consumer
 * always sees the same surface that `createLogger` itself uses — no
 * shim module, no drift.
 */

export { createLogger } from "./logger.ts";
export type { Logger, LoggerConfig } from "./types.ts";

export { withAgentContext } from "./with-context.ts";

export { STANDARD_TAGS } from "./tags.ts";
export type { StandardTagName } from "./tags.ts";

export { setupOtel, shutdownOtel } from "./otel/index.ts";

export { getActiveContext } from "./context-store.ts";

export type { AgentContext, GenaiContext } from "./types.ts";
