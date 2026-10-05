/**
 * Zod schema for a GitHub repository.
 *
 * Only the fields our agents actually read are included. `.passthrough()`
 * keeps any extra fields GitHub adds (e.g. `permissions`, `topics`) in
 * the parsed object so forward-compat work doesn't need a schema bump.
 */
import { z } from "zod";

import { GitHubHtmlUrlSchema } from "./url.ts";
import { UserSchema } from "./user.ts";

/**
 * Git ref name — anchored so it rejects `..`, refspec metacharacters
 * (`~`, `^`, `:`, `?`, `*`, `\`), and most control characters.
 *
 * Git itself accepts a slightly wider range (including `*` for refspecs
 * via `git push`), but for `default_branch` we want a plain branch name
 * only.
 */
const BranchNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^(?!.*\.\.)(?!.*[~^:?*\\])[A-Za-z0-9._/-]+$/, {
    message: "default_branch must be a valid git branch name (no refspec metacharacters)",
  });

export const RepoSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(100),
    full_name: z.string().min(3).max(200),
    private: z.boolean(),
    html_url: GitHubHtmlUrlSchema,
    default_branch: BranchNameSchema,
    owner: UserSchema,
  })
  .passthrough();

export type Repo = z.infer<typeof RepoSchema>;
