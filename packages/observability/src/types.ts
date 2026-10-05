/**
 * Public type definitions for `@workspace/observability`.
 *
 * Keep this surface minimal — downstream code only sees what is re-exported
 * from `src/index.ts`.
 */

import type { LevelName } from "./levels.ts";

/**
 * Signature shared by every level method on {@link Logger}. Each level takes
 * a human-readable message and an optional structured-fields bag.
 */
export type LogFn = (msg: string, fields?: Record<string, unknown>) => void;

/**
 * A structured JSON logger that mirrors the pino level API but is independent
 * of the pino runtime type so callers can swap implementations if needed.
 *
 * Built from a mapped type over {@link LevelName} so adding a new level
 * requires editing one constant, not six method declarations.
 */
export type Logger = { [K in LevelName]: LogFn } & {
  /** Create a sub-logger that pre-applies the given fields to every log line. */
  child(fields: Record<string, unknown>): Logger;
};

/**
 * OpenTelemetry GenAI semantic convention fields attached to every log
 * line / span emitted while the parent {@link AgentContext} is active.
 *
 * Optional — callers (typically `@workspace/llm`) populate this when an LLM
 * is invoked so the resulting spans match the OTel GenAI dashboard templates.
 */
export interface GenaiContext {
  /** Provider identifier (e.g. `"anthropic"`, `"openai"`). */
  provider?: string;
  /** Logical operation (e.g. `"chat"`, `"embedding"`). */
  operation?: string;
  /** Model identifier (e.g. `"claude-sonnet-4-5"`). */
  model?: string;
  /** Tokens consumed by the request. */
  input_tokens?: number;
  /** Tokens produced by the response. */
  output_tokens?: number;
  /** Why the model stopped generating (e.g. `"end_turn"`, `"max_tokens"`). */
  finish_reasons?: string[];
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
  /** OpenTelemetry GenAI semantic conventions for any LLM call inside this run. */
  genai?: GenaiContext;
  /** Arbitrary additional scalar context fields. Use sparingly — prefer typed keys. */
  extra?: Record<string, string | number | boolean>;
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
   * Pino level string. Caller responsibility — typically the value of
   * `env.LOG_LEVEL` parsed via `@workspace/env/schemas/base`. Defaults to
   * `"info"` when omitted.
   */
  level?: LevelName | string;
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
