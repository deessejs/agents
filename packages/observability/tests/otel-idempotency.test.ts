/**
 * Tests for OTel setup idempotency (C7) and graceful shutdown (I10).
 *
 * Strategy: mock the `NodeSDK` constructor so we can assert it is called at
 * most once across multiple `setupOtel()` invocations. This proves the C7
 * idempotency contract — not just "the call did not throw" (which was the
 * prior tautological assertion).
 *
 * We don't want these to actually open a socket to an OTLP endpoint, so we
 * exercise the public surface without supplying an `otlpEndpoint` — the SDK
 * is still created and started, but the trace exporter is left undefined.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetOtelForTests, setupOtel, shutdownOtel } from "../src/otel/index.ts";

/**
 * Each mocked SDK instance records calls to its `start` / `shutdown` methods
 * so the test can assert on them.
 */
const sdkInstances: Array<{
  start: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("@opentelemetry/sdk-node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@opentelemetry/sdk-node")>();
  const NodeSDKMock = vi.fn().mockImplementation(() => {
    const instance = {
      start: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    sdkInstances.push(instance);
    return instance;
  });
  // Preserve the original exports so TypeScript users still see the type.
  return { ...actual, NodeSDK: NodeSDKMock };
});

beforeEach(() => {
  sdkInstances.length = 0;
  __resetOtelForTests();
});

afterEach(async () => {
  await shutdownOtel();
  __resetOtelForTests();
});

describe("OpenTelemetry idempotency", () => {
  it("calling setupOtel() twice instantiates the SDK exactly once", () => {
    setupOtel({ serviceName: "agent-once" });
    setupOtel({ serviceName: "agent-twice" });
    expect(sdkInstances).toHaveLength(1);
    expect(sdkInstances[0]?.start).toHaveBeenCalledTimes(1);
  });

  it("shutdownOtel() resets state so a fresh setupOtel() instantiates a new SDK", async () => {
    setupOtel({ serviceName: "agent-lifecycle" });
    expect(sdkInstances).toHaveLength(1);

    await shutdownOtel();
    expect(sdkInstances[0]?.shutdown).toHaveBeenCalledTimes(1);

    // After shutdown, the guard is cleared — a subsequent setup must instantiate.
    setupOtel({ serviceName: "agent-lifecycle-2" });
    expect(sdkInstances).toHaveLength(2);
  });

  it("calling shutdownOtel() without prior setup is a no-op", async () => {
    await expect(shutdownOtel()).resolves.toBeUndefined();
    expect(sdkInstances).toHaveLength(0);
  });
});
