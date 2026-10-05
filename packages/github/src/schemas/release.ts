/**
 * Zod schema for a GitHub Release.
 *
 * Reference: <https://docs.github.com/en/rest/releases/releases#get-a-release>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";
import { UserSchema } from "./user.ts";

export const ReleaseSchema = z
  .object({
    id: z.number().int().positive(),
    tag_name: z.string().min(1).max(255),
    name: z.string().max(125).nullable(),
    body: z.string().max(125_000).nullable(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    created_at: IsoDateTimeSchema,
    published_at: NullableIsoDateTimeSchema,
    html_url: GitHubHtmlUrlSchema,
    author: UserSchema,
  })
  .passthrough();

export type Release = z.infer<typeof ReleaseSchema>;
