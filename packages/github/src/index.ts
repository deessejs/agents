/**
 * Public entry point for `@workspace/github`.
 *
 * Consumers use `createGitHubClient({ auth })` to get a configured
 * Octokit with throttling, retry, and pagination plugins applied.
 */
export { createGitHubClient, type GitHubClient, type GitHubClientConfig } from "./client.ts";
