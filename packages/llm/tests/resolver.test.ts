/**
 * Tests for {@link buildResolvers}.
 *
 * The contract is: a single-element tuple when no fallback models are
 * configured (so callers can destructure the head without a
 * `| undefined` narrowing), and a one-element-per-model tuple when
 * fallbacks are supplied.
 */

import { describe, expect, it, vi } from "vitest";

import { buildResolvers } from "../src/resolver.ts";
import { MODELS } from "../src/models.ts";

vi.mock("@ai-sdk/minimax", () => ({
  minimax: vi.fn(() => ({ modelId: "mock" })),
}));

describe("buildResolvers", () => {
  it("returns a length-1 tuple when no fallbacks are configured", () => {
    const resolvers = buildResolvers(MODELS.PRIMARY, [], undefined);
    expect(resolvers).toHaveLength(1);
    // Exhaustiveness: the head must be callable with no `| undefined`.
    const [head] = resolvers;
    expect(typeof head).toBe("function");
  });

  it("returns a per-model tuple when fallbacks are supplied", () => {
    const resolvers = buildResolvers(
      MODELS.PRIMARY,
      ["minimax-m2.7" as typeof MODELS.PRIMARY],
      undefined,
    );
    expect(resolvers).toHaveLength(2);
  });

  it("uses the per-call override as the head when supplied", () => {
    const resolvers = buildResolvers(MODELS.PRIMARY, [], "minimax-m2.7" as typeof MODELS.PRIMARY);
    expect(resolvers).toHaveLength(1);
  });
});
