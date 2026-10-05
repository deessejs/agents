/**
 * Zod schema for a Git ref (branch / tag reference).
 *
 * Used inside PR / Issue payloads for the `head` and `base` refs.
 * `repo` may be missing on cross-repo refs when the agent doesn't have
 * access to the source repo — we make it optional for that reason.
 */
import { z } from "zod";

import { RepoSchema } from "./repo.ts";
import { UserSchema } from "./user.ts";

export const RefSchema = z
  .object({
    label: z.string().min(1).max(255),
    ref: z.string().min(1).max(255),
    sha: z.string().regex(/^[0-9a-f]{40}$/, "sha must be a 40-char hex git SHA"),
    user: UserSchema.nullable(),
    repo: RepoSchema.optional(),
  })
  .passthrough();

export type Ref = z.infer<typeof RefSchema>;
