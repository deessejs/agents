/**
 * Zod schema for a GitHub Issue.
 *
 * GitHub returns PRs from the `/issues` endpoint — callers must filter
 * `pull_request === undefined` to exclude them. We don't model that
 * field; consumers should use `/issues` only for true issues.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { LabelSchema } from "./label.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";
import { UserSchema } from "./user.ts";

export const IssueSchema = z
  .object({
    id: z.number().int().positive(),
    number: z.number().int().positive(),
    title: z.string().min(1).max(256),
    body: z.string().max(65_536).nullable(),
    state: z.enum(["open", "closed"]),
    state_reason: z.enum(["completed", "reopened", "not_planned"]).nullable().optional(),
    user: UserSchema.nullable(),
    labels: z.array(LabelSchema),
    assignees: z.array(UserSchema),
    comments: z.number().int().nonnegative(),
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
    closed_at: NullableIsoDateTimeSchema,
    html_url: GitHubHtmlUrlSchema,
  })
  .passthrough();

export type Issue = z.infer<typeof IssueSchema>;
