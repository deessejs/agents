/**
 * Tests for `RateLimitResponseSchema`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { RateLimitResponseSchema } from "../src/schemas/rate-limit.ts";

const baseBucket = {
  limit: 5000,
  used: 100,
  remaining: 4900,
  reset: 1_726_800_000,
} as const;

const baseResponse = {
  resources: { core: baseBucket },
  rate: baseBucket,
} as const;

describe("RateLimitResponseSchema", () => {
  it("parses a minimal payload (only the core bucket)", () => {
    expect(() => RateLimitResponseSchema.parse(baseResponse)).not.toThrow();
  });

  it("accepts all documented optional buckets", () => {
    const data = {
      resources: {
        core: baseBucket,
        search: baseBucket,
        graphql: baseBucket,
        integration_manifest: baseBucket,
        code_scanning_upload: baseBucket,
        actions_runner_registration: baseBucket,
        scim: baseBucket,
        dependency_snapshots: baseBucket,
        audit_log: baseBucket,
      },
      rate: baseBucket,
    };
    expect(() => RateLimitResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects negative counters in a bucket", () => {
    const data = {
      ...baseResponse,
      rate: { ...baseBucket, used: -1 },
    };
    expect(() => RateLimitResponseSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects a reset timestamp after year 2100", () => {
    const data = {
      ...baseResponse,
      rate: { ...baseBucket, reset: 4_102_444_801 },
    };
    expect(() => RateLimitResponseSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => RateLimitResponseSchema.parse({})).toThrow(ZodError);
  });
});
