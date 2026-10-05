/**
 * OpenTelemetry SDK bootstrap.
 *
 * `setupOtel()` is **idempotent** (C7) — calling it twice is a no-op so module
 * loads that race with the bootstrap call are safe. `shutdownOtel()` flushes
 * pending spans and resets the guard; calling it again is also a no-op so
 * SIGTERM/SIGINT handlers can be wired without coordination.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

import { getOtelTracer } from "./tracer.ts";

export { getOtelTracer } from "./tracer.ts";

export interface SetupOtelOptions {
  serviceName?: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
}

/**
 * Module-level state used to enforce idempotency. The `isInitialized`
 * flag is the single source of truth — `sdk` is treated as a derived
 * value to avoid the two falling out of sync.
 */
let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * In-flight `shutdownOtel()` promise. Set while a shutdown is running
 * so concurrent callers all await the same flush instead of each
 * triggering their own.
 */
let shutdownInFlight: Promise<void> | null = null;

/**
 * Initialize the OpenTelemetry SDK exactly once. Subsequent calls return
 * without side effects so module-load races and HMR reloads are safe.
 */
export function setupOtel(opts: SetupOtelOptions = {}): void {
  if (isInitialized) return;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: opts.serviceName ?? "agent",
    [ATTR_SERVICE_VERSION]: opts.serviceVersion ?? "0.0.0",
  });

  const traceExporter = opts.otlpEndpoint
    ? new OTLPTraceExporter({
        url: `${opts.otlpEndpoint.replace(/\/$/, "")}/v1/traces`,
        headers: opts.otlpHeaders ?? {},
      })
    : undefined;

  sdk = new NodeSDK({
    resource,
    ...(traceExporter ? { traceExporter } : {}),
  });
  sdk.start();
  isInitialized = true;

  // Warm the tracer cache so the first log doesn't pay the cost.
  getOtelTracer();
}

/**
 * Flush and shut down the SDK. Safe to call when never initialized and
 * safe to call twice in a row — the second call is a no-op while the
 * first is still flushing, then a no-op again afterward.
 *
 * Concurrent callers all await the same in-flight promise, so there is
 * exactly one `sdk.shutdown()` per cycle.
 */
export async function shutdownOtel(): Promise<void> {
  if (!isInitialized || sdk === null) return;
  if (shutdownInFlight) return shutdownInFlight;

  // Capture the current SDK, then clear module state BEFORE awaiting
  // the shutdown so a follow-up `setupOtel()` can proceed without
  // waiting for the flush to finish.
  const activeSdk = sdk;
  isInitialized = false;
  sdk = null;

  shutdownInFlight = activeSdk
    .shutdown()
    .catch((err: unknown) => {
      // Swallow shutdown errors but log them — the SDK surface is
      // "fire and forget" from the caller's perspective, and a flush
      // failure should never crash the host process.
      // eslint-disable-next-line no-console
      console.error("[@workspace/observability] OTel shutdown failed:", err);
    })
    .finally(() => {
      shutdownInFlight = null;
    });
  return shutdownInFlight;
}

/**
 * Test-only hook: forget that the SDK was ever initialized. Production code
 * must never call this.
 */
export function __resetOtelForTests(): void {
  isInitialized = false;
  sdk = null;
  shutdownInFlight = null;
}
