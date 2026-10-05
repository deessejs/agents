/**
 * Zod schema for a GitHub Issue.
 *
 * GitHub returns PRs from the `/issues` endpoint — callers must filter
 * `pull_request === undefined` to exclude them. We don't model that
 * field; consumers should use `/issues` only for true issues.
 */
import { z } from "zod";
import { UserSchema } from "./user.js";
import { LabelSchema } from "./label.js";

export const IssueSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable(),
    state: z.enum(["open", "closed"]),
    state_reason: z.enum(["completed", "reopened", "not_planned"]).nullable().optional(),
    user: UserSchema.nullable(),
    labels: z.array(LabelSchema),
    assignees: z.array(UserSchema),
    comments: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable(),
    html_url: z.string(),
  })
  .strict();

export type Issue = z.infer<typeof IssueSchema>;
