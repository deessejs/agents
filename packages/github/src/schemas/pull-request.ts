/**
 * Zod schema for a GitHub Pull Request.
 *
 * Field reference: <https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request>.
 */
import { z } from "zod";
import { UserSchema } from "./user.js";
import { LabelSchema } from "./label.js";
import { RefSchema } from "./ref.js";

export const PullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable(),
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
    created_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable(),
    merged_at: z.string().nullable(),
    merge_commit_sha: z.string().nullable(),
    additions: z.number().int().nullable(),
    deletions: z.number().int().nullable(),
    changed_files: z.number().int().nullable(),
    comments: z.number().int(),
    review_comments: z.number().int(),
    commits: z.number().int(),
    html_url: z.string(),
    labels: z.array(LabelSchema),
  })
  .strict();

export type PullRequest = z.infer<typeof PullRequestSchema>;
