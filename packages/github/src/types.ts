/**
 * Re-exports of all entity types inferred from the Zod schemas.
 *
 * Use these types in domain code:
 *   import type { PullRequest, Issue } from "@workspace/github/types";
 */
export type { User as GitHubUser } from "./schemas/user.js";

export type { Repo as GitHubRepo } from "./schemas/repo.js";

export type { Label as GitHubLabel } from "./schemas/label.js";

export type { Ref as GitHubRef } from "./schemas/ref.js";

export type { PullRequest } from "./schemas/pull-request.js";

export type { Issue } from "./schemas/issue.js";

export type { Review } from "./schemas/review.js";

export type { Release } from "./schemas/release.js";

export type { DependabotAlert } from "./schemas/dependabot-alert.js";

export type { CodeScanningAlert } from "./schemas/code-scanning-alert.js";

export type { SecretScanningAlert } from "./schemas/secret-scanning-alert.js";

export type { WorkflowRun } from "./schemas/workflow-run.js";

export type { ActionJob, ActionStep } from "./schemas/action-job.js";
