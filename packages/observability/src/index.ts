/**
 * Public API surface for `@workspace/observability`.
 *
 * Subpath exports (`./otel`, `./redact`, `./tags`, `./types`) live in their
 * own entry points; this index exports the most common helpers for
 * `import { createLogger, withAgentContext } from "@workspace/observability"`.
 */

export { createLogger } from "./create-logger.ts";
export { withAgentContext } from "./with-context.ts";
export { STANDARD_TAGS } from "./tags.ts";
export { setupOtel, shutdownOtel } from "./otel/index.ts";
export { getActiveContext } from "./context-store.ts";
export type { AgentContext, GenaiContext, LogFn, Logger, LoggerConfig } from "./types.ts";
