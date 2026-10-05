import { MockLanguageModelV3, simulateReadableStream } from "ai/test";

/**
 * Build a deterministic `LanguageModelV3` for tests.
 *
 * Returns a `LanguageModelV3` because `ai@7.0.127`'s `generateText` /
 * `streamText` consume the V3 spec. (The mock builder in `ai/test` does
 * not expose a V2 mock; V2 is still in `@ai-sdk/provider` but only as a
 * type.)
 *
 * The `LanguageModelV3CallOptions`/`GenerateResult`/`StreamResult` types
 * live in `@ai-sdk/provider`, which we intentionally don't depend on in
 * the package.json. We type our callbacks loosely with `unknown` so the
 * mock builder keeps working without the type import.
 */
export interface MockModelOptions {
  /** Static text returned from `doGenerate` and the text stream. */
  text?: string;
  /** Optional usage breakdown. Defaults to 10 / 5 / 0. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  };
  /** Unified finish reason reported by the mock. Default: `'stop'`. */
  finishReason?: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
  /** Chunks emitted by `doStream`. Overrides `text` if provided. */
  chunks?: string[];
  /** Provider metadata to attach to the `generate` result. */
  providerMetadata?: Record<string, unknown>;
  /** Throws the given error from the FIRST `doGenerate` call only. */
  throwOnce?: Error;
  /** Invoked on every `doGenerate` call (for assertion). */
  onGenerate?: (opts: unknown) => void;
  /** Invoked on every `doStream` call (for assertion). */
  onStream?: (opts: unknown) => void;
}

const DEFAULT_TEXT = "hello world";

export function makeMockModel(opts: MockModelOptions = {}): MockLanguageModelV3 {
  const text = opts.text ?? DEFAULT_TEXT;
  const inputTokens = opts.usage?.inputTokens ?? 10;
  const outputTokens = opts.usage?.outputTokens ?? 5;
  const cachedTokens = opts.usage?.cachedInputTokens ?? 0;
  const finishReason = opts.finishReason ?? "stop";
  const providerMetadata = opts.providerMetadata;

  let generateCalls = 0;

  const doGenerate = async (callOpts: unknown): Promise<unknown> => {
    generateCalls += 1;
    opts.onGenerate?.(callOpts);
    if (opts.throwOnce !== undefined && generateCalls === 1) {
      throw opts.throwOnce;
    }
    const base: Record<string, unknown> = {
      content: [{ type: "text", text }],
      finishReason: { unified: finishReason, raw: finishReason },
      usage: {
        inputTokens: {
          total: inputTokens,
          noCache: inputTokens - cachedTokens,
          cacheRead: cachedTokens,
          cacheWrite: 0,
        },
        outputTokens: {
          total: outputTokens,
          text: outputTokens,
          reasoning: 0,
        },
      },
      warnings: [],
    };
    if (providerMetadata !== undefined) {
      base.providerMetadata = providerMetadata;
    }
    return base;
  };

  const doStream = async (callOpts: unknown): Promise<unknown> => {
    opts.onStream?.(callOpts);
    const chunks = opts.chunks ?? [text];
    // Stream parts the AI SDK understands. text-delta is what `textStream`
    // surfaces; stream-start opens the response.
    const streamParts: Array<Record<string, unknown>> = [{ type: "stream-start", warnings: [] }];
    for (const chunk of chunks) {
      streamParts.push({ type: "text-delta", id: "t1", delta: chunk });
    }
    return {
      stream: simulateReadableStream({ chunks: streamParts }),
    };
  };

  return new MockLanguageModelV3({
    modelId: "mock-minimax-m3",
    // Cast to `any` here because MockLanguageModelV3's expected
    // doGenerate/doStream signatures reference @ai-sdk/provider types
    // we don't import.
    doGenerate: doGenerate as never,
    doStream: doStream as never,
  });
}
