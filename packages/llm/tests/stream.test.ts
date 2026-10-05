/**
 * Tests for {@link streamComplete}.
 *
 * We mock `streamText` from the AI SDK with a controllable async
 * iterable so we can assert chunk delivery and error propagation without
 * a real provider.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above imports; the mock must be hoisted via
// `vi.hoisted` so it's available inside the factory.
const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: mocks.streamText as never,
  };
});

import { streamComplete } from "../src/stream.ts";
import { MODELS } from "../src/models.ts";

const baseConfig = {
  primary: MODELS.PRIMARY,
  fallbackModels: [] as ReadonlyArray<typeof MODELS.PRIMARY>,
  promptCaching: true,
  maxRetries: 2,
  timeoutMs: 30_000,
};

afterEach(() => {
  mocks.streamText.mockReset();
});

describe("streamComplete", () => {
  it("yields every chunk returned by the underlying streamText", async () => {
    mocks.streamText.mockReturnValueOnce({
      textStream: (async function* () {
        yield "hello ";
        yield "world";
      })(),
    });

    const stream = await streamComplete({ prompt: "hi" }, baseConfig);
    const collected: string[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }
    expect(collected).toEqual(["hello ", "world"]);
  });

  it("propagates errors thrown during stream construction", async () => {
    mocks.streamText.mockImplementationOnce(() => {
      throw new Error("upstream boom");
    });

    await expect(streamComplete({ prompt: "hi" }, baseConfig)).rejects.toThrow("upstream boom");
  });

  it("returns an empty iterable when the provider emits no chunks", async () => {
    mocks.streamText.mockReturnValueOnce({
      textStream: (async function* () {
        // empty
      })(),
    });

    const stream = await streamComplete({ prompt: "hi" }, baseConfig);
    const collected: string[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }
    expect(collected).toEqual([]);
  });
});
