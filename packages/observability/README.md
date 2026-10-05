# @workspace/observability

> Pino-backed structured JSON logger with `AsyncLocalStorage`-scoped agent context, automatic redaction, and optional OpenTelemetry export.

## Elevator pitch

`createLogger({ agent, ... })` returns a `Logger` whose level methods
(`info`, `warn`, `error`, …) take a message + optional fields and merge
on the canonical `agent.name`, `agent.schedule`, and (when an
OpenTelemetry tracer is configured) the OpenTelemetry `gen_ai.*`
semantic-convention tags. Wrap any block in `withAgentContext({ ... }, fn)`
to project those tags onto every log line emitted inside `fn`, plus any
spans when one is set up. Redaction of secrets (auth headers, GitHub PATs,
Resend keys, JWTs, emails) is on by default and extensible.

## Install

Internal workspace package — add to `dependencies`:

```json
{
  "dependencies": {
    "@workspace/observability": "workspace:*",
    "pino": "catalog:"
  }
}
```

## Quick start (30 lines)

```ts
import { createLogger, withAgentContext, setupOtel, shutdownOtel } from "@workspace/observability";

// One-time, idempotent OTel bootstrap (safe to call from many modules).
setupOtel({ serviceName: "agent-technical-analyst", serviceVersion: "0.1.0" });

await withAgentContext(
  {
    agent: "agent-technical-analyst",
    run_id: crypto.randomUUID(),
    schedule: "daily-digest",
    genai: { provider: "minimax", operation: "chat", model: "minimax-m3" },
  },
  async (log) => {
    log.info("digest composed", { pr_count: 12 });
    // Emitted with: agent.name, agent.run_id, agent.schedule,
    //               gen_ai.provider.name, gen_ai.operation.name, ...
  },
  { level: "info", env: "production" },
);

// Flush OTel spans before the process exits.
await shutdownOtel();
```

## API reference

### `createLogger(config: LoggerConfig): Logger`

Build a per-agent structured JSON logger. The returned `Logger` mirrors
pino's level API but is independent of the runtime type — you can swap
implementations behind it without changing callers.

### `Logger`

```ts
interface Logger {
  trace: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  fatal: LogFn;
  child(fields: Record<string, unknown>): Logger;
}

type LogFn = (msg: string, fields?: Record<string, unknown>) => void;
```

### `LoggerConfig`

```ts
interface LoggerConfig {
  agent: string; // → agent.name tag.
  env?: string; // → deployment.environment.
  level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  redactPaths?: string[]; // Add to pino redact paths.
  redactValuePatterns?: { name: string; re: RegExp }[]; // Add to value scan.
}
```

### `withAgentContext<T>(ctx, fn, loggerConfig?): Promise<T>`

Run `fn` inside an `AsyncLocalStorage` scope. Every log line emitted
within `fn` (or any function it awaits) carries the canonical
`agent.*` tags derived from `ctx`. When OTel is configured, the GenAI
fields on `ctx.genai` are also projected as `gen_ai.*` tags onto the
active span.

```ts
await withAgentContext(
  { agent: "agent-x", run_id: "uuid" },
  async (log) => log.info("hello"), // tagged with agent.name, agent.run_id
);
```

The `Logger` instance is passed as the first argument to `fn` so nested
calls don't need a fresh `createLogger`.

### `getActiveContext(): AgentContext | undefined`

Read the currently active context, or `undefined` if no
`withAgentContext` scope is active on this async chain. Useful for
helpers that want to inspect context without coupling to the store.

### `setupOtel(opts?): void` / `shutdownOtel(): Promise<void>`

Bootstrap / tear down the OpenTelemetry SDK. `setupOtel` is idempotent
— calling it twice is a no-op. `shutdownOtel` is also idempotent and
flushes pending spans. Pair `shutdownOtel` with `SIGTERM` / `SIGINT`
handlers in long-lived processes.

```ts
setupOtel({
  serviceName: "agent-x",
  serviceVersion: "0.1.0",
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT, // e.g. "http://localhost:4318"
  otlpHeaders: { "x-honeycomb-team": process.env.HONEYCOMB_API_KEY! },
});
```

### `STANDARD_TAGS`

Canonical tag names every agent uses:

| Tag                              | Source                         |
| -------------------------------- | ------------------------------ |
| `agent.name`                     | `ctx.agent`                    |
| `agent.version`                  | (reserved)                     |
| `agent.run_id`                   | `ctx.run_id`                   |
| `agent.schedule`                 | `ctx.schedule`                 |
| `agent.channel`                  | `ctx.channel`                  |
| `correlation.parent_agent`       | `ctx.correlation_parent_agent` |
| `deployment.environment`         | `config.env`                   |
| `gen_ai.provider.name`           | `ctx.genai.provider`           |
| `gen_ai.operation.name`          | `ctx.genai.operation`          |
| `gen_ai.request.model`           | `ctx.genai.model`              |
| `gen_ai.usage.input_tokens`      | `ctx.genai.input_tokens`       |
| `gen_ai.usage.output_tokens`     | `ctx.genai.output_tokens`      |
| `gen_ai.response.finish_reasons` | `ctx.genai.finish_reasons`     |

Use `STANDARD_TAGS` constants (not literal strings) in dashboards so a
typo can't silently misroute data.

## Redaction

`createLogger` builds pino's redact config from defaults plus anything in
`LoggerConfig.redactPaths` / `redactValuePatterns`.

### `DEFAULT_REDACT_PATHS`

Built-in path patterns pino's `redact` option handles natively (auth
headers at any depth, pino-reserved paths).

### `DEFAULT_VALUE_PATTERNS`

Built-in regex patterns applied via a `formatters.log` hook because pino
can't redact by value natively:

| Pattern          | Matches                                     |
| ---------------- | ------------------------------------------- |
| `resend_api_key` | `re_<20+ alnum>`                            |
| `github_pat`     | `ghp_* / github_pat_* / ghu_/gho/ghs/ghr_*` |
| `bearer`         | `Bearer <token>`                            |
| `jwt`            | Three-segment base64url JWTs                |
| `email_pii`      | RFC-5322-style addresses                    |

Extend via `redactValuePatterns: [{ name: "internal_id", re: /\bID-[A-Z0-9]{8}\b/g }]`.

## Subpath map

| Subpath                           | Source                  |
| --------------------------------- | ----------------------- |
| `@workspace/observability`        | `./src/index.ts`        |
| `@workspace/observability/tags`   | `./src/tags.ts`         |
| `@workspace/observability/redact` | `./src/redact/index.ts` |
| `@workspace/observability/otel`   | `./src/otel/index.ts`   |

## JSDoc imports

```ts
import {
  createLogger,
  withAgentContext,
  getActiveContext,
  setupOtel,
  shutdownOtel,
  STANDARD_TAGS,
  type AgentContext,
  type GenaiContext,
  type Logger,
  type LoggerConfig,
  type StandardTagName,
} from "@workspace/observability";

// Built-in redaction defaults live in the `redact` subpath so they
// stay out of the package's main entry surface.
import { DEFAULT_REDACT_PATHS, DEFAULT_VALUE_PATTERNS } from "@workspace/observability/redact";
```
