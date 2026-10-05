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
 * Module-level state used to enforce idempotency. When `sdk` is non-null we
 * consider the SDK initialized and skip re-creation on subsequent calls.
 */
let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize the OpenTelemetry SDK exactly once. Subsequent calls return
 * without side effects so module-load races and HMR reloads are safe.
 */
export function setupOtel(opts: SetupOtelOptions = {}): void {
  if (isInitialized || sdk) return;

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
 * Flush and shut down the SDK. Safe to call when never initialized and safe
 * to call twice in a row — both are no-ops.
 */
export async function shutdownOtel(): Promise<void> {
  if (!isInitialized || !sdk) return;
  const activeSdk = sdk;
  // Reset state first so concurrent callers see a clean shutdown.
  isInitialized = false;
  sdk = null;
  await activeSdk.shutdown();
}

/**
 * Test-only hook: forget that the SDK was ever initialized. Production code
 * must never call this.
 */
export function __resetOtelForTests(): void {
  isInitialized = false;
  sdk = null;
}
