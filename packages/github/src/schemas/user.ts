/**
 * Zod schema for a GitHub user.
 *
 * GitHub returns either a user, an organization, or a bot in this slot —
 * see <https://docs.github.com/en/rest/users/users>.
 */
import { z } from "zod";

export const UserSchema = z
  .object({
    login: z.string(),
    id: z.number().int(),
    avatar_url: z.string(),
    html_url: z.string(),
    type: z.enum(["User", "Organization", "Bot"]).default("User"),
  })
  .strict();

export type User = z.infer<typeof UserSchema>;
