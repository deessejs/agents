/**
 * Zod schema for a GitHub repository.
 *
 * Only the fields our agents actually read are included. Other fields
 * (e.g. `permissions`, `topics`) are stripped by `.strict()` so we notice
 * if downstream code depends on something we forgot to declare.
 */
import { z } from "zod";
import { UserSchema } from "./user.js";

export const RepoSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string(),
    private: z.boolean(),
    html_url: z.string(),
    default_branch: z.string(),
    owner: UserSchema,
  })
  .strict();

export type Repo = z.infer<typeof RepoSchema>;
