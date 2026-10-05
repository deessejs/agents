import { describe, expect, it } from "vitest";
import type { SystemModelMessage } from "ai";

import { withCaching } from "../src/cache.ts";

describe("withCaching", () => {
  it("wraps a plain string into a SystemModelMessage with the Anthropic cache breakpoint", () => {
    const result = withCaching("You are a helpful assistant.");
    if (Array.isArray(result)) throw new Error("expected single message");
    expect(result.role).toBe("system");
    expect(result.content).toBe("You are a helpful assistant.");
    const providerOptions = result.providerOptions as
      | { anthropic?: { cacheControl?: { type?: string; ttl?: string } } }
      | undefined;
    expect(providerOptions?.anthropic?.cacheControl?.type).toBe("ephemeral");
    expect(providerOptions?.anthropic?.cacheControl?.ttl).toBe("1h");
  });

  it("is idempotent on a single message: re-applying preserves the directive", () => {
    const first = withCaching("system text");
    if (Array.isArray(first)) throw new Error("expected single message");
    const third = withCaching(first as SystemModelMessage);
    if (Array.isArray(third)) throw new Error("expected single message");
    expect(third.role).toBe("system");
    expect(third.content).toBe("system text");
    const providerOptions = third.providerOptions as
      | { anthropic?: { cacheControl?: { type?: string; ttl?: string } } }
      | undefined;
    expect(providerOptions?.anthropic?.cacheControl?.type).toBe("ephemeral");
    expect(providerOptions?.anthropic?.cacheControl?.ttl).toBe("1h");
  });

  it("maps an array of messages element-wise", () => {
    const input: SystemModelMessage[] = [
      { role: "system", content: "first system" },
      { role: "system", content: "second system" },
    ];
    const result = withCaching(input);
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) throw new Error("expected array");
    expect(result).toHaveLength(2);
    for (const msg of result) {
      const providerOptions = msg.providerOptions as
        | { anthropic?: { cacheControl?: { type?: string; ttl?: string } } }
        | undefined;
      expect(providerOptions?.anthropic?.cacheControl?.type).toBe("ephemeral");
    }
  });

  it("preserves existing anthropic provider options across re-wraps", () => {
    const seed: SystemModelMessage = {
      role: "system",
      content: "with extras",
      providerOptions: {
        anthropic: { custom: { nested: true } },
      },
    };
    const first = withCaching(seed);
    if (Array.isArray(first)) throw new Error("expected single message");
    const second = withCaching(first);
    if (Array.isArray(second)) throw new Error("expected single message");
    const providerOptions = second.providerOptions as {
      anthropic?: { cacheControl?: unknown; custom?: unknown };
    };
    expect(providerOptions.anthropic?.custom).toEqual({ nested: true });
    expect(providerOptions.anthropic?.cacheControl).toBeDefined();
  });
});
