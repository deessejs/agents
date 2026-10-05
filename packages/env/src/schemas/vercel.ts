import { z } from "zod";

/**
 * Vercel deployment environment schema.
 *
 * Every field is optional — these variables are populated by Vercel
 * only when the agent runs inside a deployment.
 */
export const vercelSchema = z
  .object({
    VERCEL: z.enum(["1"]).optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_REGION: z.string().optional(),
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
    VERCEL_GIT_COMMIT_MESSAGE: z.string().optional(),
  })
  .strict();
