/**
 * Zod schema for a PR review.
 *
 * Reference: <https://docs.github.com/en/rest/pulls/reviews#get-a-review-for-a-pull-request>.
 */
import { z } from "zod";

import { NullableIsoDateTimeSchema } from "./datetime.ts";
import { CommitShaSchema } from "./shared.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";
import { UserSchema } from "./user.ts";

export const ReviewSchema = z
  .object({
    id: z.number().int().positive(),
    user: UserSchema.nullable(),
    body: z.string().max(65_536).nullable(),
    state: z.enum(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"]),
    submitted_at: NullableIsoDateTimeSchema,
    commit_id: CommitShaSchema,
    html_url: GitHubHtmlUrlSchema,
  })
  .passthrough();

export type Review = z.infer<typeof ReviewSchema>;
