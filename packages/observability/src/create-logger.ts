/**
 * `createLogger` — the public factory for a per-agent structured JSON logger.
 */

import { createPinoWrapper } from "./logger.ts";
import type { Logger, LoggerConfig } from "./types.ts";

/**
 * Build a {@link Logger} configured with the standard tags, redaction, and
 * level rules.
 */
export function createLogger(config: LoggerConfig): Logger {
  return createPinoWrapper(config);
}

export type { Logger, LoggerConfig } from "./types.ts";
