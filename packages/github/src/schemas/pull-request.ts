/**
 * Zod schema for a GitHub Pull Request.
 *
 * Field reference: <https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { LabelSchema } from "./label.ts";
import { RefSchema } from "./ref.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";
import { UserSchema } from "./user.ts";

/**
 * PR mergeability state — GitHub documents five possible values; the API
 * also returns `null` while it's still computing.
 */
const MergeableStateSchema = z.enum(["clean", "dirty", "unstable", "draft", "blocked"]).nullable();

export const PullRequestSchema = z
  .object({
    id: z.number().int().positive(),
    number: z.number().int().positive(),
    title: z.string().min(1).max(256),
    body: z.string().max(65_536).nullable(),
    state: z.enum(["open", "closed"]),
    draft: z.boolean(),
    merged: z.boolean().optional(),
    // `mergeable` is null when the repo is being calculated; only set after
    // the mergeability check completes.
    mergeable: z.boolean().nullable().optional(),
    mergeable_state: z.string().optional(),
    user: UserSchema.nullable(),
    head: RefSchema,
    base: RefSchema,
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
    closed_at: NullableIsoDateTimeSchema,
    merged_at: NullableIsoDateTimeSchema,
    merge_commit_sha: z.string().nullable(),
    additions: z.number().int().nullable(),
    deletions: z.number().int().nullable(),
    changed_files: z.number().int().nullable(),
    comments: z.number().int(),
    review_comments: z.number().int(),
    commits: z.number().int(),
    html_url: GitHubHtmlUrlSchema,
    labels: z.array(LabelSchema),
  })
  // Re-export the mergeable-state enum for callers that want the type.
  .passthrough();

export { MergeableStateSchema };
export type PullRequest = z.infer<typeof PullRequestSchema>;
