/**
 * Zod schema for a GitHub user.
 *
 * GitHub returns either a user, an organization, or a bot in this slot —
 * see <https://docs.github.com/en/rest/users/users>.
 */
import { z } from "zod";

import { GitHubAvatarUrlSchema, GitHubHtmlUrlSchema } from "./url.ts";

export const UserSchema = z
  .object({
    login: z.string().min(1).max(39),
    id: z.number().int().positive(),
    avatar_url: GitHubAvatarUrlSchema,
    html_url: GitHubHtmlUrlSchema,
    type: z.enum(["User", "Organization", "Bot"]).default("User"),
  })
  .passthrough();

export type User = z.infer<typeof UserSchema>;
