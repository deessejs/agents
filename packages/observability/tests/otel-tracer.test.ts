/**
 * Tests for `getOtelTracer`.
 *
 * The contract is: before `setupOtel()` runs (or when no SDK is installed),
 * `getOtelTracer()` returns a no-op tracer that swallows all operations.
 * After `setupOtel()` (or in any environment where the global tracer
 * provider is set), the returned tracer is a real one — but we don't
 * depend on that here, we just verify the noop fallback contract.
 */

import { describe, expect, it } from "vitest";
import { trace, type Tracer } from "@opentelemetry/api";

import { getOtelTracer } from "../src/otel/tracer.ts";

/**
 * Verify a tracer is "behaving like a tracer" — it exposes the right
 * surface, name-agnostic. The noop proxy returns ProxyTracer objects whose
 * identity is fresh on every call, so we check by behaviour and shape.
 */
function isUsableTracer(value: unknown): value is Tracer {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.startSpan === "function" && typeof candidate.startActiveSpan === "function"
  );
}

describe("getOtelTracer", () => {
  it("uses the package default name when no name is supplied", () => {
    const tracer = getOtelTracer();
    expect(isUsableTracer(tracer)).toBe(true);
    // Cross-check that the global tracer registry, when asked for the same
    // name, returns an object with the same shape (ProxyTracer, in the
    // noop-fallback case).
    const same = trace.getTracer("@workspace/observability");
    expect(isUsableTracer(same)).toBe(true);
  });

  it("honours a custom name", () => {
    const tracer = getOtelTracer("my-component");
    expect(isUsableTracer(tracer)).toBe(true);
  });

  it("returns a no-op tracer when no SDK is registered (default state)", () => {
    // Without `setupOtel()` having been called, the global tracer provider
    // is the noop provider — `getOtelTracer()` must still return a usable
    // tracer whose span methods don't throw.
    const tracer = getOtelTracer("noop-contract");
    const span = tracer.startSpan("test-span");
    expect(span).toBeDefined();
    // Noop span operations must not throw.
    expect(() => span.end()).not.toThrow();
    expect(() => span.setAttribute("k", "v")).not.toThrow();
    expect(() => span.recordException(new Error("boom"))).not.toThrow();
  });
});
