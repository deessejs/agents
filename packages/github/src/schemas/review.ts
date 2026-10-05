/**
 * Zod schema for a PR review.
 *
 * Reference: <https://docs.github.com/en/rest/pulls/reviews#get-a-review-for-a-pull-request>.
 */
import { z } from "zod";
import { UserSchema } from "./user.js";

export const ReviewSchema = z
  .object({
    id: z.number().int(),
    user: UserSchema.nullable(),
    body: z.string().nullable(),
    state: z.enum(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"]),
    submitted_at: z.string().nullable(),
    commit_id: z.string(),
    html_url: z.string(),
  })
  .strict();

export type Review = z.infer<typeof ReviewSchema>;
