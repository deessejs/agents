/**
 * Thin pino wrapper that conforms to the {@link Logger} interface and knows
 * how to merge the active {@link AgentContext} (if any) onto every log call.
 */

import pino, { type Logger as PinoLogger } from "pino";

import { getActiveContext } from "./context-store.ts";
import { createRedactor } from "./redact/index.ts";
import type { ValuePattern } from "./redact/values.ts";
import { STANDARD_TAGS } from "./tags.ts";
import type { AgentContext, LoggerConfig, Logger } from "./types.ts";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type LevelName = (typeof LEVELS)[number];

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
 * Project the active context into the standard tag names. Returns `undefined`
 * when no context is active.
 */
function projectContextTags(): Record<string, unknown> | undefined {
  const ctx = getActiveContext();
  if (!ctx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (value === undefined) continue;
    const tag = CONTEXT_TO_TAG[key] ?? tagForUnknownContextField(key);
    out[tag] = value;
  }
  return out;
}

/**
 * Fallback tag for context fields without a canonical name. The `agent.`
 * namespace is reserved for canonical tags, so we prefix the literal key with
 * `context.` to keep things searchable without colliding.
 */
function tagForUnknownContextField(key: string): string {
  return `context.${key}`;
}

export interface PinoLoggerOptions {
  redactPaths?: string[];
  redactValuePatterns?: ValuePattern[];
}

/**
 * Resolve the pino level string. Priority: config > env > default `"info"`.
 */
function resolveLevel(configLevel?: string): string {
  if (configLevel) return configLevel;
  if (typeof process !== "undefined" && process.env && process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  return "info";
}

/**
 * Construct the wrapped Logger. Accepts an already-built pino instance plus
 * the original config so we can rebuild the child loggers with consistent
 * options.
 */
export function wrapPino(pinoInstance: PinoLogger): Logger {
  const call = (level: LevelName) => (msg: string, fields?: Record<string, unknown>) => {
    const ctxTags = projectContextTags();
    const merged: Record<string, unknown> = {};
    if (ctxTags) Object.assign(merged, ctxTags);
    if (fields) Object.assign(merged, fields);
    // Pino adds msg + level automatically; we only pass the fields object.
    pinoInstance[level](merged, msg);
  };

  return {
    trace: call("trace"),
    debug: call("debug"),
    info: call("info"),
    warn: call("warn"),
    error: call("error"),
    fatal: call("fatal"),
    child: (fields: Record<string, unknown>): Logger => {
      // Merge the active context into the child so it follows the same scope.
      const ctxTags = projectContextTags() ?? {};
      return wrapPino(pinoInstance.child({ ...ctxTags, ...fields }));
    },
  };
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

export type { AgentContext };
