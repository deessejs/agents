/**
 * Combined redaction factory. Pino's `redact` option handles fixed key paths
 * (headers, env vars), but cannot match by value — we extend it with a
 * `formatters.log` hook that walks every log object and replaces any string
 * matching one of the value patterns.
 */

import type { LoggerOptions } from "pino";

import { DEFAULT_REDACT_PATHS } from "./paths.ts";
import { DEFAULT_VALUE_PATTERNS, walk, type ValuePattern } from "./values.ts";

export { DEFAULT_REDACT_PATHS } from "./paths.ts";
export { DEFAULT_VALUE_PATTERNS, REDACTED, walk, type ValuePattern } from "./values.ts";

export interface RedactorOptions {
  /** Extra path patterns merged on top of {@link DEFAULT_REDACT_PATHS}. */
  paths?: string[];
  /** Extra value patterns merged on top of {@link DEFAULT_VALUE_PATTERNS}. */
  valuePatterns?: ValuePattern[];
}

/**
 * Build the pino options object that enables both path-based and value-based
 * redaction. Returned object is spread into the pino constructor.
 */
export function createRedactor(
  opts: RedactorOptions = {},
): Pick<LoggerOptions, "redact" | "formatters"> {
  const paths = [...DEFAULT_REDACT_PATHS, ...(opts.paths ?? [])];
  const patterns = [...DEFAULT_VALUE_PATTERNS, ...(opts.valuePatterns ?? [])];

  return {
    redact: {
      paths,
      censor: "[REDACTED]",
    },
    formatters: {
      // Pino calls this hook for every log object before serialization.
      log: (object: Record<string, unknown>) => walk(object, patterns) as Record<string, unknown>,
    },
  };
}
