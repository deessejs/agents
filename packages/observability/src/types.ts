/**
 * Public type definitions for `@workspace/observability`.
 *
 * Keep this surface minimal — downstream code only sees what is re-exported
 * from `src/index.ts`.
 */

/**
 * A structured JSON logger that mirrors the pino level API but is independent
 * of the pino runtime type so callers can swap implementations if needed.
 */
export interface Logger {
  trace(msg: string, fields?: Record<string, unknown>): void;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  fatal(msg: string, fields?: Record<string, unknown>): void;
  /** Create a sub-logger that pre-applies the given fields to every log line. */
  child(fields: Record<string, unknown>): Logger;
}

/**
 * Per-run context attached via {@link withAgentContext}. Anything set here is
 * merged into every log line and (when OTel is configured) into every span
 * emitted within the callback.
 */
export interface AgentContext {
  /** Canonical agent identifier, e.g. `"agent-technical-analyst"`. */
  agent: string;
  /** Stable per-run identifier, typically `crypto.randomUUID()`. */
  run_id: string;
  /** Schedule that produced this run, e.g. `"daily-digest"`. */
  schedule?: string;
  /** Channel that initiated the run, e.g. `"vercel-cron"`. */
  channel?: string;
  /** Parent agent when this run was spawned by another agent. */
  correlation_parent_agent?: string;
  /** Arbitrary additional context fields. */
  [key: string]: unknown;
}

/**
 * Configuration accepted by {@link createLogger}. All redaction lists extend
 * the defaults — callers cannot disable a built-in rule.
 */
export interface LoggerConfig {
  /** Agent identifier that becomes the `agent` tag on every log line. */
  agent: string;
  /** Deployment environment, typically `process.env.NODE_ENV`. */
  env?: string;
  /**
   * Pino level string. Defaults to the `LOG_LEVEL` environment variable, or
   * `"info"` if neither is set.
   */
  level?: string;
  /**
   * Additional pino redact paths merged on top of {@link DEFAULT_REDACT_PATHS}.
   * Use for header names / env var keys that the defaults miss.
   */
  redactPaths?: string[];
  /**
   * Additional regex-based value redaction patterns merged on top of
   * {@link DEFAULT_VALUE_PATTERNS}. Use for secrets with a known format.
   */
  redactValuePatterns?: { name: string; re: RegExp }[];
}
