/**
 * Tracer helper. Returns a tracer scoped to this package's spans so users get a
 * consistent name unless they override it.
 */

import { trace, type Tracer } from "@opentelemetry/api";

const DEFAULT_NAME = "@workspace/observability";

/**
 * Resolve a tracer. Always safe to call — before `setupOtel()` runs this falls
 * back to the noop tracer, so callers can grab it at module load without
 * worrying about initialization order.
 */
export function getOtelTracer(name: string = DEFAULT_NAME): Tracer {
  return trace.getTracer(name);
}
