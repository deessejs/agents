import type { z } from "zod";

/**
 * Thrown when `createEnv` fails to validate the environment.
 *
 * The message is already formatted for humans, so printing
 * `err.message` is enough to surface a useful error to operators.
 */
export class EnvValidationError extends Error {
  public readonly issues: ReadonlyArray<EnvIssue>;

  constructor(message: string, issues: ReadonlyArray<EnvIssue> = []) {
    super(message);
    this.name = "EnvValidationError";
    this.issues = issues;
    // Preserve the V8 stack of the caller where the error was thrown.
    const ErrorProto = Error as {
      captureStackTrace?: (target: object, ctor: new (...args: never[]) => unknown) => void;
    };
    if (typeof ErrorProto.captureStackTrace === "function") {
      ErrorProto.captureStackTrace(this, EnvValidationError);
    }
  }
}

/**
 * A single validation issue, augmented with a human-friendly hint
 * when one is registered for the offending key.
 */
export interface EnvIssue {
  /** Dot-joined path of the failing field, e.g. `"GITHUB_TOKEN"`. */
  readonly key: string;
  /** Underlying Zod issue message. */
  readonly message: string;
  /** Actionable hint for known keys, undefined otherwise. */
  readonly hint?: string;
  /** The (possibly masked) value Zod received. */
  readonly received?: unknown;
}

/**
 * Map of known env keys to actionable hints.
 *
 * Keep entries short, imperative, and never include the value of a
 * secret. These hints are printed verbatim in error messages.
 */
const HINTS: Readonly<Record<string, string>> = Object.freeze({
  GITHUB_TOKEN:
    "set GITHUB_TOKEN in your .env or Vercel env vars (fine-grained PAT, needs: contents:read, issues:read, pull_requests:read)",
  GITHUB_ORG: "set GITHUB_ORG to the GitHub organisation slug the agent operates on",
  RESEND_API_KEY: "set RESEND_API_KEY (starts with 're_') in your env vars",
  RESEND_FROM_ADDRESS: "set RESEND_FROM_ADDRESS to a valid email on a verified Resend domain",
  RESEND_REPLY_TO: "set RESEND_REPLY_TO to a valid email, or remove the variable",
  VERCEL_ENV: "set VERCEL_ENV to one of: development, preview, production",
  VERCEL_URL: "set VERCEL_URL to the deployment URL (set automatically by Vercel)",
  VERCEL_REGION: "set VERCEL_REGION to the deployment region (set automatically by Vercel)",
  NODE_ENV: "set NODE_ENV to one of: development, test, staging, production",
  LOG_LEVEL: "set LOG_LEVEL to one of: trace, debug, info, warn, error, fatal",
});

/**
 * Keys that are considered secrets. Their values are never echoed in
 * error messages to avoid leaking credentials into logs.
 */
const SECRET_KEYS: ReadonlySet<string> = new Set(["GITHUB_TOKEN", "RESEND_API_KEY"]);

/**
 * Returns a short, human-readable label for an issue.
 *
 * Uses a discriminated-union narrowing switch on `issue.code` so that
 * each branch has a narrowed `issue` shape and we never need an `as`
 * cast to read provider-specific fields.
 */
function describeMessage(issue: z.ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return "Invalid type";
    case "too_small":
      return "Required";
    case "too_big":
      return "Too large";
    case "not_multiple_of":
      return "Not a multiple of the divisor";
    case "invalid_format": {
      // `invalid_format` issues always carry a string `format` (e.g.
      // "email", "url", "regex"); the narrowing predicate below proves
      // it without an `as` cast.
      const format: string = typeof issue.format === "string" ? issue.format : "format";
      return `Invalid ${format}`;
    }
    case "unrecognized_keys":
      return "Unrecognized keys";
    case "invalid_union":
      return "Invalid value";
    case "invalid_key":
      return "Invalid key";
    case "invalid_element":
      return "Invalid element";
    case "invalid_value":
      return "Invalid value";
    case "custom":
      return "Invalid value";
    default: {
      // Exhaustiveness check — if Zod ever adds a new `ZodIssue["code"]`
      // variant, this assignment will fail to compile and force us to
      // decide how to render it. The cast keeps the runtime path
      // returning a useful label even when the union drifts.
      const exhaustive: never = issue;
      return (exhaustive as { message: string }).message;
    }
  }
}

/**
 * Masks secret values so they don't leak into error output.
 *
 * Known secret keys always render as `"[REDACTED]"` — we never leak
 * even a 2-character prefix, because a prefix narrows the search space
 * for an attacker. Non-secrets are truncated to 32 chars for readability.
 *
 * Internal — reachable from tests via direct import on `../src/error.ts`.
 * Not part of the package's public API surface — see `src/index.ts`.
 */
function maskValue(key: string, value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (SECRET_KEYS.has(key)) return "[REDACTED]";
  const asString = typeof value === "string" ? value : JSON.stringify(value);
  if (asString.length > 32) {
    return `${asString.slice(0, 29)}...`;
  }
  return asString;
}

/**
 * Project a `ZodError` into the public {@link EnvIssue} array shape.
 *
 * Centralised so both {@link formatEnvError} (string rendering) and
 * {@link toEnvValidationError} (wrapped error) stay in lock-step on
 * how each Zod issue becomes an `EnvIssue`.
 */
function buildEnvIssues(error: z.ZodError): EnvIssue[] {
  return error.issues.map((issue) => {
    const key = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    const hint = HINTS[key];
    const message = describeMessage(issue);
    return hint !== undefined
      ? { key, message, hint, received: issue.input }
      : { key, message, received: issue.input };
  });
}

/**
 * Formats a `ZodError` into a readable, actionable error block.
 *
 * The result always ends with a "fail-fast" footer so the message
 * reads as a complete instruction when printed to stderr.
 *
 * Internal — only {@link toEnvValidationError} calls this. Not part of
 * the package's public API surface — see `src/index.ts`.
 */
function formatEnvError(error: z.ZodError): string {
  const issues = buildEnvIssues(error);
  const header = `[agent-env] Environment validation failed (${issues.length} error${issues.length === 1 ? "" : "s"}):`;
  const blocks: string[] = [header, ""];

  for (const issue of issues) {
    blocks.push(`  ✗ ${issue.key} — ${issue.message}`);
    if (issue.received !== undefined) {
      blocks.push(`    Got: ${maskValue(issue.key, issue.received)}`);
    }
    if (issue.hint !== undefined) {
      blocks.push(`    Hint: ${issue.hint}`);
    }
    blocks.push("");
  }

  blocks.push("Aborting to fail fast.");
  return blocks.join("\n");
}

/**
 * Wraps a `ZodError` in an {@link EnvValidationError} whose message is
 * the formatted output of {@link formatEnvError}.
 *
 * Internal: only `create-env.ts` calls this. Not part of the package's
 * public API surface — see `src/index.ts`.
 */
export function toEnvValidationError(error: z.ZodError): EnvValidationError {
  const issues = buildEnvIssues(error);
  return new EnvValidationError(formatEnvError(error), issues);
}
