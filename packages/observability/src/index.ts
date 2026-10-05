/**
 * Public API surface for `@workspace/observability`.
 *
 * Subpath exports (`./otel`, `./redact`, `./tags`, `./types`) live in their
 * own entry points; this index exports the most common helpers for
 * `import { createLogger, withAgentContext } from "@workspace/observability"`.
 *
 * Type re-exports are sourced from `./create-logger.ts` (the canonical
 * public-source entry) so a consumer always sees the same surface that
 * `createLogger` itself uses — no double-export, no drift.
 */

export { createLogger } from "./create-logger.ts";
export type { Logger, LoggerConfig } from "./create-logger.ts";

export { withAgentContext } from "./with-context.ts";

export { STANDARD_TAGS } from "./tags.ts";
export type { StandardTagName } from "./tags.ts";

export { setupOtel, shutdownOtel } from "./otel/index.ts";

export { getActiveContext } from "./context-store.ts";

export type { AgentContext, GenaiContext } from "./types.ts";
