/**
 * Zod schema for a GitHub Release.
 *
 * Reference: <https://docs.github.com/en/rest/releases/releases#get-a-release>.
 */
import { z } from "zod";
import { UserSchema } from "./user.js";

export const ReleaseSchema = z
  .object({
    id: z.number().int(),
    tag_name: z.string(),
    name: z.string().nullable(),
    body: z.string().nullable(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    created_at: z.string(),
    published_at: z.string().nullable(),
    html_url: z.string(),
    author: UserSchema,
  })
  .strict();

export type Release = z.infer<typeof ReleaseSchema>;
