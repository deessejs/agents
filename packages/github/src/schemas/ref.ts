/**
 * Zod schema for a Git ref (branch / tag reference).
 *
 * Used inside PR / Issue payloads for the `head` and `base` refs.
 * `repo` may be missing on cross-repo refs when the agent doesn't have
 * access to the source repo — we make it optional for that reason.
 */
import { z } from "zod";
import { UserSchema } from "./user.js";
import { RepoSchema } from "./repo.js";

export const RefSchema = z
  .object({
    label: z.string(),
    ref: z.string(),
    sha: z.string(),
    user: UserSchema.nullable(),
    repo: RepoSchema.optional(),
  })
  .strict();

export type Ref = z.infer<typeof RefSchema>;
