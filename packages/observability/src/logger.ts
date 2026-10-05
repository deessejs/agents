/**
 * Thin pino wrapper that conforms to the {@link Logger} interface and knows
 * how to merge the active {@link AgentContext} (if any) onto every log call.
 */

import pino, { type Logger as PinoLogger } from "pino";

import { getActiveContext } from "./context-store.ts";
import { LEVELS, type LevelName } from "./levels.ts";
import { createRedactor } from "./redact/index.ts";
import type { ValuePattern } from "./redact/values.ts";
import { STANDARD_TAGS } from "./tags.ts";
import type { AgentContext, GenaiContext, LogFn, Logger, LoggerConfig } from "./types.ts";

/**
 * Map of AgentContext fields → canonical tag name. Anything in `ctx` that
 * matches a known tag is emitted under that name so downstream queries can
 * filter on `agent.run_id` without knowing about the context shape.
 */
const CONTEXT_TO_TAG: Record<string, string> = {
  agent: STANDARD_TAGS.AGENT_NAME,
  run_id: STANDARD_TAGS.AGENT_RUN_ID,
  schedule: STANDARD_TAGS.AGENT_SCHEDULE,
  channel: STANDARD_TAGS.AGENT_CHANNEL,
  correlation_parent_agent: STANDARD_TAGS.CORRELATION_PARENT,
};

/**
 * Map of GenAI semantic convention keys → canonical `gen_ai.*` tag name. Only
 * the fields actually present on the GenAI sub-context are emitted.
 */
const GENAI_TO_TAG: Record<keyof GenaiContext, string> = {
  provider: STANDARD_TAGS.GEN_AI_PROVIDER,
  operation: STANDARD_TAGS.GEN_AI_OPERATION,
  model: STANDARD_TAGS.GEN_AI_REQUEST_MODEL,
  input_tokens: STANDARD_TAGS.GEN_AI_USAGE_INPUT,
  output_tokens: STANDARD_TAGS.GEN_AI_USAGE_OUTPUT,
  finish_reasons: STANDARD_TAGS.GEN_AI_RESPONSE_FINISH_REASONS,
};

/**
 * Fallback tag for context fields without a canonical name. The `agent.`
 * namespace is reserved for canonical tags, so we prefix the literal key with
 * `context.` to keep things searchable without colliding.
 */
function tagForUnknownContextField(key: string): string {
  return `context.${key}`;
}

/**
 * Project the active context into the standard tag names. Returns `undefined`
 * when no context is active. GenAI tags are projected when the context's
 * `genai` sub-object is populated; arbitrary `extra` fields land under the
 * `context.*` namespace.
 */
function projectContextTags(): Record<string, unknown> | undefined {
  const ctx = getActiveContext();
  if (!ctx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (value === undefined) continue;
    if (key === "genai") {
      projectGenaiTags(value as GenaiContext, out);
      continue;
    }
    if (key === "extra") {
      for (const [extraKey, extraValue] of Object.entries(value as Record<string, unknown>)) {
        if (extraValue === undefined) continue;
        out[tagForUnknownContextField(extraKey)] = extraValue;
      }
      continue;
    }
    const tag = CONTEXT_TO_TAG[key] ?? tagForUnknownContextField(key);
    out[tag] = value;
  }
  return out;
}

/**
 * Copy GenAI sub-context fields into `out`, mapping each key to the
 * canonical `gen_ai.*` tag name. Skips undefined values.
 */
function projectGenaiTags(genai: GenaiContext, out: Record<string, unknown>): void {
  for (const key of Object.keys(GENAI_TO_TAG) as Array<keyof GenaiContext>) {
    const value = genai[key];
    if (value === undefined) continue;
    out[GENAI_TO_TAG[key]] = value;
  }
}

export interface PinoLoggerOptions {
  redactPaths?: string[];
  redactValuePatterns?: ValuePattern[];
}

/**
 * Resolve the pino level string. Priority: explicit `configLevel` first, then
 * `"info"`. The logger package does NOT read `process.env` directly — callers
 * are expected to wire their level via `LoggerConfig.level` (typically by
 * passing `env.LOG_LEVEL` parsed through `@workspace/env/schemas/base`).
 */
function resolveLevel(configLevel?: string): string {
  return configLevel ?? "info";
}

/**
 * Construct the wrapped Logger. Accepts an already-built pino instance plus
 * the original config so we can rebuild the child loggers with consistent
 * options.
 */
export function wrapPino(pinoInstance: PinoLogger): Logger {
  const call =
    (level: LevelName): LogFn =>
    (msg, fields) => {
      const ctxTags = projectContextTags();
      const merged: Record<string, unknown> = {};
      if (ctxTags) Object.assign(merged, ctxTags);
      if (fields) Object.assign(merged, fields);
      // Pino adds msg + level automatically; we only pass the fields object.
      pinoInstance[level](merged, msg);
    };

  const logger = {} as Logger;
  for (const level of LEVELS) {
    logger[level] = call(level);
  }
  logger.child = (fields: Record<string, unknown>): Logger => {
    // Merge the active context into the child so it follows the same scope.
    const ctxTags = projectContextTags() ?? {};
    return wrapPino(pinoInstance.child({ ...ctxTags, ...fields }));
  };
  return logger;
}

/**
 * Build a pino logger pre-configured with redaction, level, and the standard
 * `agent.name` / `deployment.environment` bindings. Exposed so callers can plug
 * their own logger (e.g. for testing) into the rest of the package.
 */
export function buildPinoLogger(config: LoggerConfig, opts: PinoLoggerOptions = {}): PinoLogger {
  const redactOptions = createRedactor({
    paths: [...(config.redactPaths ?? []), ...(opts.redactPaths ?? [])],
    valuePatterns: [...(config.redactValuePatterns ?? []), ...(opts.redactValuePatterns ?? [])],
  });

  const base: Record<string, unknown> = {
    [STANDARD_TAGS.AGENT_NAME]: config.agent,
    service: config.agent,
  };
  if (config.env) base[STANDARD_TAGS.DEPLOYMENT_ENV] = config.env;

  return pino({
    level: resolveLevel(config.level),
    base,
    ...redactOptions,
    // Use the built-in error serializer so Error instances land in a stable
    // shape with message / stack / type.
    serializers: {
      err: pino.stdSerializers.err,
    },
  });
}

/**
 * Construct the public {@link Logger} from a {@link LoggerConfig}. Used by
 * `createLogger` and by `withAgentContext` (which builds a child logger with
 * the context tags already merged).
 */
export function createPinoWrapper(config: LoggerConfig): Logger {
  const pinoInstance = buildPinoLogger(config);
  return wrapPino(pinoInstance);
}

export type { AgentContext, GenaiContext };
