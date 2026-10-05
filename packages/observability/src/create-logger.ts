/**
 * Type-only re-exports for `@workspace/observability` consumers.
 *
 * The `createLogger` factory lives in `./logger.ts` (the canonical
 * implementation) and is re-exported from `./index.ts` directly. This
 * file remains as the single source of truth for the consumer-facing
 * type surface so downstream code can pin a single import path:
 *
 *   import { createLogger, type Logger, type LoggerConfig } from
 *     "@workspace/observability";
 */

export type { Logger, LoggerConfig } from "./types.ts";
