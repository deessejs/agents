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
 *
 * We parse with the `URL` constructor and compare the resulting
 * `hostname` (case-folded) against the allow-list. Prefix matching
 * previously passed attacks like `https://evil.com/.api.github.com/x` and
 * `https://api.github.com.attacker.com/x`; the parsed hostname approach
 * also distinguishes `github.com:443` (allowed) from `github.com.evil.com`
 * (rejected).
 */
import { z } from "zod";

/**
 * Allow-list of hostnames we treat as "GitHub-controlled" — anything in
 * here passes, anything else fails with a clear Zod error.
 *
 * Exact hostname matches only; no prefix matching. `raw.githubusercontent.com`
 * etc. share `githubusercontent.com` as their parent hostname.
 */
const GITHUB_HOSTNAMES = new Set<string>([
  "github.com",
  "api.github.com",
  "avatars.githubusercontent.com",
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
  "camo.githubusercontent.com",
  "githubusercontent.com",
]);

/**
 * `true` if the URL's hostname is `github.com` exactly, OR a subdomain of
 * `githubusercontent.com`. `URL.hostname` is already lowercased by the
 * spec, so we don't need to `.toLowerCase()` again here.
 */
function isGitHubControlledUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname;
    if (GITHUB_HOSTNAMES.has(hostname)) return true;
    // Accept any `*.githubusercontent.com` (covers
    // `avatars.githubusercontent.com`, `raw.`, etc. as a safety net even
    // though they're already in the allow-list).
    if (hostname.endsWith(".githubusercontent.com")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Canonical URL schema for any REST `html_url` field on a GitHub API
 * response. Accepts any GitHub-controlled hostname.
 *
 * Use {@link GitHubHtmlUrlSchema} when you need a tighter constraint
 * (only `github.com` / `api.github.com`) or {@link GitHubAvatarUrlSchema}
 * for avatar URLs (only `avatars.githubusercontent.com`).
 */
export const GitHubRestUrlSchema = z.url().max(2048).refine(isGitHubControlledUrl, {
  message: "URL must be on a github.com-controlled hostname",
});

/** `html_url` field — appears on every entity GitHub exposes. */
export const GitHubHtmlUrlSchema = z
  .url()
  .max(2048)
  .refine(
    (rawUrl) => {
      try {
        const hostname = new URL(rawUrl).hostname;
        return hostname === "github.com" || hostname === "api.github.com";
      } catch {
        return false;
      }
    },
    {
      message: "html_url must be on github.com or api.github.com",
    },
  );

/** `avatar_url` field — always served from `avatars.githubusercontent.com`. */
export const GitHubAvatarUrlSchema = z
  .url()
  .max(2048)
  .refine(
    (rawUrl) => {
      try {
        return new URL(rawUrl).hostname === "avatars.githubusercontent.com";
      } catch {
        return false;
      }
    },
    {
      message: "avatar_url must be hosted on avatars.githubusercontent.com",
    },
  );
