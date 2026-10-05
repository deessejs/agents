# @workspace/llm

> A thin AI SDK façade with a fallback chain, prompt caching, retries, and a token counter — built on `@ai-sdk/minimax`.

## Elevator pitch

`createLLM()` returns a handle with `complete`, `streamComplete`, and
`countTokens`. Defaults: `MODELS.PRIMARY`, prompt caching on, 2 retries,
30s timeout, no fallback. Override per-call via `CompletionOpts.model` or
globally via `LLMConfig`. Retries transparently on 429 / 5xx / overload
and walks the configured fallback chain before giving up.

## Install

Internal workspace package — add to `dependencies`:

```json
{
  "dependencies": {
    "@workspace/llm": "workspace:*",
    "ai": "catalog:",
    "@ai-sdk/minimax": "catalog:"
  }
}
```

## Quick start (30 lines)

```ts
import { createLLM, MODELS } from "@workspace/llm";

const llm = createLLM({
  primary: MODELS.PRIMARY,
  fallbackModels: [],
  promptCaching: true,
  maxRetries: 2,
  timeoutMs: 30_000,
});

const { text, usage, finishReason } = await llm.complete({
  system: "You are a helpful assistant.",
  prompt: "Summarize the diff in 3 bullets.",
  maxTokens: 200,
  temperature: 0.3,
  metadata: { agent: "team:technical-analyst" },
});

console.log(text);
// usage: { promptTokens, completionTokens, cachedInputTokens? }
```

## API reference

### `createLLM(config?: LLMConfig): LLM`

Returns a handle bound to `config`. Each call to `complete` /
`streamComplete` re-resolves the model so per-call overrides take effect.

### `LLM`

| Method                 | Returns                          | Notes                                                  |
| ---------------------- | -------------------------------- | ------------------------------------------------------ |
| `complete(opts)`       | `Promise<CompletionResult>`      | Single-shot generation; throws on terminal failure.    |
| `streamComplete(opts)` | `Promise<AsyncIterable<string>>` | Text-only async iterable; mid-stream errors propagate. |
| `countTokens(text)`    | `number`                         | Synchronous, uses cl100k_base.                         |

### `LLMConfig`

```ts
interface LLMConfig {
  primary?: ModelId; // Default: MODELS.PRIMARY
  fallbackModels?: ModelId[]; // Tried in order on retryable errors.
  promptCaching?: boolean; // Attach Anthropic cache breakpoint. Default: true.
  maxRetries?: number; // Per-call. Default: 2.
  timeoutMs?: number; // Per-call timeout. Default: 30_000.
}
```

### `CompletionOpts`

```ts
interface CompletionOpts {
  system?: string;
  prompt: string;
  model?: ModelId; // Override primary for this call.
  maxTokens?: number; // Default: 2000. Hard schema cap: 8192.
  temperature?: number; // Default: 0.3.
  promptCaching?: boolean; // Per-call toggle. Default: true.
  metadata?: Record<string, string>;
}
```

### `CompletionResult`

```ts
interface CompletionResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    cachedInputTokens?: number; // Read from Anthropic provider metadata.
  };
  finishReason: FinishReason;
  model: ModelId; // Effective model — useful when fallback fired.
}
```

## Helpers

### `withCaching(input)`

Wraps a system prompt (string or `SystemModelMessage[]`) with the
Anthropic cache breakpoint (`{ type: "ephemeral", ttl: "1h" }`). Use when
you want to opt-in explicitly instead of letting the default config decide.

```ts
const instructions = withCaching("You are a helpful assistant.");
```

### `withFallback(primary, ...fallbacks)`

Try each in sequence; advance to the next on a retryable error
(`429 / 5xx / OverloadError / network`); non-retryable errors bubble
immediately. Last rejection re-thrown after every fallback is exhausted.

### `countTokens(text)`

Local heuristic using `gpt-tokenizer` (cl100k_base). Good enough for
budget enforcement and digest length validation; not authoritative for
Anthropic's tokenizer.

### `isRetryable(err): boolean`

Duck-type predicate that returns `true` for transient upstream failures
the fallback chain should retry on.

## MODELS

```ts
import { MODELS, type ModelId } from "@workspace/llm";

MODELS.PRIMARY; // "minimax-m3"
```

`ModelId` falls back to `string & {}` so provider-accepted ids not in
the constant are still typeable.

## Cost control guidance

1. **Use `countTokens` before `complete`** to enforce a per-prompt budget
   on local heuristics.
2. **Set `promptCaching: true`** (default) — repeated system prompts hit
   the Anthropic 1h cache, slashing input token cost.
3. **Configure `fallbackModels`** for graceful degradation: the primary
   model's overload / 429 transparently retries on the fallback before
   the caller sees anything.
4. **Tune `maxTokens`** per call (200 for summaries, 2000 for generation)
   rather than globally — the API validates `maxTokens <= 8192`.
5. **Pass `metadata`** so AI SDK telemetry flows through to your
   observability backend; tags from `withAgentContext` are merged in.

## JSDoc imports

```ts
import {
  createLLM,
  MODELS,
  withCaching,
  withFallback,
  countTokens,
  isRetryable,
  type LLM,
  type LLMConfig,
  type CompletionOpts,
  type CompletionResult,
  type CompletionUsage,
  type ModelId,
} from "@workspace/llm";
```

## Subpath map

| Subpath          | Source           |
| ---------------- | ---------------- |
| `@workspace/llm` | `./src/index.ts` |

Subpath exports for splitting the package surface (`./complete`,
`./stream`, etc.) are planned but not yet wired into `package.json`.
