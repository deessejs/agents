import { z } from "zod";

/**
 * Base environment schema.
 *
 * Provides defaults so every agent has at least `NODE_ENV` and
 * `LOG_LEVEL` available without having to opt in.
 */
export const baseSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  })
  .strict();
