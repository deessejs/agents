/**
 * Shared URL validator for every `html_url` / `avatar_url` field we accept
 * from the GitHub REST API.
 *
 * The GitHub API occasionally returns a few non-canonical hostnames
 * (`api.github.com`, `avatars.githubusercontent.com`, `github.com`,
 * Enterprise tenants). We accept them all via a single allow-list.
 *
 * Uses Zod 4 top-level `z.url()` (not the chained `z.string().url()`) so
 * we can layer the hostname allow-list and length bounds in one schema.
 */
import { z } from "zod";

/**
 * Allow-list of hostnames we treat as "GitHub-controlled" — anything in
 * here passes, anything else fails with a clear Zod error.
 */
const GITHUB_HOSTNAMES = new Set<string>([
  "https://github.com/",
  "https://api.github.com/",
  "https://avatars.githubusercontent.com/",
  "https://raw.githubusercontent.com/",
  "https://user-images.githubusercontent.com/",
  "https://camo.githubusercontent.com/",
]);

/**
 * Predicate: is the URL's origin in the GitHub allow-list? Allows any path,
 * query, and fragment after the origin.
 */
function isGitHubControlledUrl(rawUrl: string): boolean {
  for (const prefix of GITHUB_HOSTNAMES) {
    if (rawUrl.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Canonical URL schema for any `html_url` / `avatar_url` field on a GitHub
 * API response. Use {@link GitHubHtmlUrlSchema} for `html_url` specifically
 * and {@link GitHubAvatarUrlSchema} for avatar URLs (which are always on
 * `avatars.githubusercontent.com`).
 */
export const GitHubUrlSchema = z.url().max(2048).refine(isGitHubControlledUrl, {
  message: "URL must be on a github.com-controlled hostname",
});

/** `html_url` field — appears on every entity GitHub exposes. */
export const GitHubHtmlUrlSchema = GitHubUrlSchema;

/** `avatar_url` field — always served from `avatars.githubusercontent.com`. */
export const GitHubAvatarUrlSchema = z
  .url()
  .max(2048)
  .refine((rawUrl) => rawUrl.startsWith("https://avatars.githubusercontent.com/"), {
    message: "avatar_url must be hosted on avatars.githubusercontent.com",
  });
