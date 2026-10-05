/**
 * Tests for the {@link createLLM} factory.
 *
 * The `complete` / `streamComplete` methods wrap `generateText` / `streamText`
 * from the AI SDK, which require a real language-model call. To verify
 * that the factory wires defaults into the call site, we mock the AI SDK
 * primitives and capture the call options.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

interface GenerateCallOpts {
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
}

// `vi.mock` is hoisted above module imports; the mock objects must
// therefore also be hoisted via `vi.hoisted`.
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(async (_opts: GenerateCallOpts): Promise<unknown> => ({
    text: "ok",
    usage: { inputTokens: 1, outputTokens: 1 },
    finishReason: "stop",
    providerMetadata: undefined,
  })),
  streamText: vi.fn((_opts: GenerateCallOpts): unknown => {
    const stream = (async function* () {
      yield "chunk";
    })();
    return { textStream: stream };
  }),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: mocks.generateText as never,
    streamText: mocks.streamText as never,
  };
});

import { createLLM } from "../src/create-llm.ts";
import { MODELS } from "../src/models.ts";

afterEach(() => {
  mocks.generateText.mockClear();
  mocks.streamText.mockClear();
});

function firstCallOpts(): GenerateCallOpts {
  const calls = mocks.generateText.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const first = calls[0];
  expect(first).toBeDefined();
  return first![0] as GenerateCallOpts;
}

describe("createLLM", () => {
  it("exposes complete, streamComplete, and countTokens", () => {
    const llm = createLLM();
    expect(typeof llm.complete).toBe("function");
    expect(typeof llm.streamComplete).toBe("function");
    expect(typeof llm.countTokens).toBe("function");
  });

  it("passes the default timeout (30000ms) to generateText", async () => {
    const llm = createLLM();
    await llm.complete({ prompt: "hi" });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(firstCallOpts().timeout).toBe(30_000);
  });

  it("passes the default maxRetries (2) to generateText", async () => {
    const llm = createLLM();
    await llm.complete({ prompt: "hi" });
    expect(firstCallOpts().maxRetries).toBe(2);
  });

  it("passes the default temperature (0.3) when none is supplied", async () => {
    const llm = createLLM();
    await llm.complete({ prompt: "hi" });
    expect(firstCallOpts().temperature).toBe(0.3);
  });

  it("honors custom config (overrides maxRetries and timeoutMs)", async () => {
    const llm = createLLM({ maxRetries: 5, timeoutMs: 5000 });
    await llm.complete({ prompt: "hi" });
    const opts = firstCallOpts();
    expect(opts.maxRetries).toBe(5);
    expect(opts.timeout).toBe(5000);
  });

  it("uses MODELS.PRIMARY as the default model when none is configured", async () => {
    const llm = createLLM();
    const result = await llm.complete({ prompt: "hi" });
    expect(result.model).toBe(MODELS.PRIMARY);
  });
});
