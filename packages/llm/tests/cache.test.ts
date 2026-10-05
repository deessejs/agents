import { describe, expect, it } from "vitest";
import type { SystemModelMessage } from "ai";

import { withCaching } from "../src/cache.ts";

describe("withCaching", () => {
  it("wraps a plain string into a SystemModelMessage with the Anthropic cache breakpoint", () => {
    const result = withCaching("You are a helpful assistant.");
    expect(result.role).toBe("system");
    expect(result.content).toBe("You are a helpful assistant.");
    const providerOptions = result.providerOptions as
      | { anthropic?: { cacheControl?: { type?: string; ttl?: string } } }
      | undefined;
    expect(providerOptions?.anthropic?.cacheControl?.type).toBe("ephemeral");
    expect(providerOptions?.anthropic?.cacheControl?.ttl).toBe("1h");
  });

  it("is idempotent: re-applying on an already-cached message preserves the directive", () => {
    const first = withCaching("system text");
    const third = withCaching(first as SystemModelMessage);
    expect(third.role).toBe("system");
    expect(third.content).toBe("system text");
    const providerOptions = third.providerOptions as
      | { anthropic?: { cacheControl?: { type?: string; ttl?: string } } }
      | undefined;
    expect(providerOptions?.anthropic?.cacheControl?.type).toBe("ephemeral");
    expect(providerOptions?.anthropic?.cacheControl?.ttl).toBe("1h");
  });
});
