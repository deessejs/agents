/**
 * Custom error classes for the agent runtime.
 *
 * Per the runtime doc §4.4 + the locked Phase 2 #18: these are
 * inlined here. The original `assertNotKilled`, `withIdempotency`, and
 * `RateLimitExhausted` helpers from the 3e-round review are
 * module-private in this file (the named helpers are 1-3 lines of
 * inline logic).
 */

/** Thrown at the start of Phase 2 when remaining < 500 (I4). */
export class RateLimitExhausted extends Error {
  override readonly name = "RateLimitExhausted";
  constructor(
    public readonly remaining: number,
    public readonly reset: number,
  ) {
    super(`GitHub rate limit too low: remaining=${remaining}, reset=${reset}`);
  }
}

/**
 * Read the kill-switch. If `agents:paused === "true"`, throw — the
 * schedule aborts with an info log at the call site.
 */
export async function assertNotKilled(
  kvGet: (key: string) => Promise<string | null>,
): Promise<void> {
  if ((await kvGet("agents:paused")) === "true") {
    throw new Error("Agent is paused (kill-switch set: agents:paused=true)");
  }
}
