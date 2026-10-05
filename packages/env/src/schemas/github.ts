import { z } from "zod";

/**
 * GitHub integration schema.
 *
 * Requires a token (fine-grained PAT) and the org slug the agent
 * operates on. Both fields are required because there's no sensible
 * default for either.
 *
 * The token regex accepts every GitHub token prefix: classic PATs
 * (`ghp_`), fine-grained PATs (`github_pat_`), OAuth tokens (`gho_`),
 * user-to-server tokens (`ghu_`), server-to-server tokens (`ghs_`),
 * and refresh tokens (`ghr_`).
 */
export const githubSchema = z
  .object({
    GITHUB_TOKEN: z
      .string()
      .regex(
        /^(?:ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{20,}$/,
        "GITHUB_TOKEN must be a valid GitHub token",
      ),
    GITHUB_ORG: z.string().min(1, "GITHUB_ORG is required"),
  })
  .strict();
