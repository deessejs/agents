/**
 * Zod schema for the response of `GET /rate_limit`.
 *
 * Reference: <https://docs.github.com/en/rest/rate-limit>.
 */
import { z } from "zod";

/**
 * Single rate-limit bucket — used for both `resources.core` and `rate`.
 * `reset` is a unix timestamp in seconds (per GitHub docs).
 */
const RateLimitBucketSchema = z.object({
  limit: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  reset: z.number().int(),
});

/**
 * Full `/rate_limit` response. We only care about `rate` (the core
 * bucket) for our own use, but the schema accepts the full payload so it
 * matches the live API.
 */
export const RateLimitResponseSchema = z
  .object({
    resources: z.object({
      core: RateLimitBucketSchema,
      search: RateLimitBucketSchema.optional(),
      graphql: RateLimitBucketSchema.optional(),
      integration_manifest: RateLimitBucketSchema.optional(),
      code_scanning_upload: RateLimitBucketSchema.optional(),
      actions_runner_registration: RateLimitBucketSchema.optional(),
      scim: RateLimitBucketSchema.optional(),
      dependency_snapshots: RateLimitBucketSchema.optional(),
      audit_log: RateLimitBucketSchema.optional(),
    }),
    rate: RateLimitBucketSchema,
  })
  .passthrough();

export type RateLimitResponse = z.infer<typeof RateLimitResponseSchema>;
