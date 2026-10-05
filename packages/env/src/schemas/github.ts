import { z } from "zod";

/**
 * GitHub integration schema.
 *
 * Requires a token (fine-grained PAT) and the org slug the agent
 * operates on. Both fields are required because there's no sensible
 * default for either.
 */
export const githubSchema = z
  .object({
    GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
    GITHUB_ORG: z.string().min(1, "GITHUB_ORG is required"),
  })
  .strict();
