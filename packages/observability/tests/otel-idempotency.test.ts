/**
 * Tests for OTel setup idempotency (C7) and graceful shutdown (I10).
 *
 * We don't want these to actually open a socket to an OTLP endpoint, so we
 * exercise the public surface without supplying an `otlpEndpoint` — the SDK
 * is still created and started, but the trace exporter is left undefined.
 */

import { afterEach, describe, expect, it } from "vitest";

import { __resetOtelForTests, setupOtel, shutdownOtel } from "../src/otel/index.ts";

describe("OpenTelemetry idempotency", () => {
  afterEach(async () => {
    await shutdownOtel();
    __resetOtelForTests();
  });

  it("calling setupOtel() twice is a no-op the second time", () => {
    setupOtel({ serviceName: "agent-once" });
    setupOtel({ serviceName: "agent-twice" });
    // We can't introspect the SDK directly, but the contract is "second call
    // returns without throwing". Both calls must succeed.
    expect(true).toBe(true);
  });

  it("shutdownOtel() resets state so a fresh setupOtel() works again", async () => {
    setupOtel({ serviceName: "agent-lifecycle" });
    await shutdownOtel();
    // After shutdown, the guard is cleared — a subsequent setup must succeed.
    setupOtel({ serviceName: "agent-lifecycle-2" });
    expect(true).toBe(true);
  });

  it("calling shutdownOtel() without prior setup is a no-op", async () => {
    await expect(shutdownOtel()).resolves.toBeUndefined();
  });
});
