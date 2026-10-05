/**
 * Tests for {@link complete}.
 *
 * We mock `generateText` from the AI SDK so the test suite doesn't hit a
 * real provider. The mock is configured per-test to return either a
 * success payload or to throw.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above imports; mock objects must be hoisted via
// `vi.hoisted` so they're available inside the factory.
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: mocks.generateText as never,
  };
});

import { complete } from "../src/complete.ts";
import { MODELS } from "../src/models.ts";

const baseConfig = {
  primary: MODELS.PRIMARY,
  fallbackModels: [] as ReadonlyArray<typeof MODELS.PRIMARY>,
  promptCaching: true,
  maxRetries: 2,
  timeoutMs: 30_000,
};

interface GenerateCallOpts {
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
  experimental_telemetry?: { isEnabled: boolean };
  prompt?: string;
  instructions?: unknown;
}

function lastCall(): GenerateCallOpts {
  const args = mocks.generateText.mock.calls.at(-1);
  if (args === undefined) throw new Error("generateText was not called");
  return args[0] as GenerateCallOpts;
}

afterEach(() => {
  mocks.generateText.mockReset();
});

describe("complete", () => {
  it("maps the AI SDK result into our CompletionResult shape", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "generated",
      usage: { inputTokens: 42, outputTokens: 7 },
      finishReason: "stop",
      providerMetadata: {
        anthropic: { usage: { cache_read_input_tokens: 12 } },
      },
    });

    const result = await complete({ prompt: "hi" }, baseConfig);
    expect(result.text).toBe("generated");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.promptTokens).toBe(42);
    expect(result.usage.completionTokens).toBe(7);
    expect(result.usage.cachedInputTokens).toBe(12);
    expect(result.model).toBe(MODELS.PRIMARY);
  });

  it("propagates non-retryable errors without consuming fallbacks", async () => {
    const boom = new Error("invalid prompt");
    mocks.generateText.mockRejectedValueOnce(boom);

    await expect(complete({ prompt: "hi" }, baseConfig)).rejects.toBe(boom);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("enables telemetry so partial observability data flows through every call", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "x",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      providerMetadata: undefined,
    });

    await complete({ prompt: "hi", metadata: { agent: "ta" } }, baseConfig);
    const opts = lastCall();
    expect(opts.experimental_telemetry?.isEnabled).toBe(true);
  });

  it("attaches the Anthropic cache breakpoint when promptCaching is enabled", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "x",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      providerMetadata: undefined,
    });

    await complete({ prompt: "hi", system: "be helpful" }, baseConfig);
    const opts = lastCall();
    const instructions = opts.instructions as
      | { providerOptions?: { anthropic?: { cacheControl?: { type?: string; ttl?: string } } } }
      | undefined;
    expect(instructions?.providerOptions?.anthropic?.cacheControl?.type).toBe("ephemeral");
    expect(instructions?.providerOptions?.anthropic?.cacheControl?.ttl).toBe("1h");
  });

  it("skips the cache breakpoint when promptCaching is false at the call site", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "x",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      providerMetadata: undefined,
    });

    await complete({ prompt: "hi", system: "be helpful", promptCaching: false }, baseConfig);
    const opts = lastCall();
    expect(opts.instructions).toBe("be helpful");
  });

  it("falls back to the configured fallback model on retryable errors", async () => {
    mocks.generateText.mockRejectedValueOnce(new Error("429 rate limit")).mockResolvedValueOnce({
      text: "fallback won",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      providerMetadata: undefined,
    });

    const result = await complete(
      { prompt: "hi" },
      { ...baseConfig, fallbackModels: ["minimax-m2.7" as typeof MODELS.PRIMARY] },
    );
    expect(result.text).toBe("fallback won");
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it("honors a per-call model override and reflects it on the CompletionResult", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "override won",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      providerMetadata: undefined,
    });

    const result = await complete(
      { prompt: "hi", model: "minimax-m2.7" as typeof MODELS.PRIMARY },
      baseConfig,
    );
    expect(result.text).toBe("override won");
    expect(result.model).toBe("minimax-m2.7");
    // Only the primary should have been tried (override replaces primary).
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("forwards metadata to generateText via experimental_telemetry.metadata", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "x",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      providerMetadata: undefined,
    });

    await complete({ prompt: "hi", metadata: { agent: "ta", schedule: "daily" } }, baseConfig);
    const opts = lastCall();
    const telemetry = opts.experimental_telemetry as
      | { isEnabled?: boolean; metadata?: Record<string, string> }
      | undefined;
    expect(telemetry?.isEnabled).toBe(true);
    expect(telemetry?.metadata).toEqual({ agent: "ta", schedule: "daily" });
  });

  it("validates maxTokens at the API boundary and throws on out-of-range", async () => {
    await expect(complete({ prompt: "hi", maxTokens: 9000 }, baseConfig)).rejects.toThrow(
      /maxTokens/,
    );
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("validates temperature at the API boundary and throws on out-of-range", async () => {
    await expect(complete({ prompt: "hi", temperature: 5 }, baseConfig)).rejects.toThrow(
      /temperature/,
    );
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
