import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEnv } from "../src/create-env.ts";
import { EnvValidationError } from "../src/error.ts";
import type { EnvIssue } from "../src/error.ts";

/**
 * Helper that swaps `process.env` for the given record for the
 * duration of `fn`, then restores the original values.
 */
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
  }
  // `Object.assign` cannot delete keys; for `undefined` values we
  // must call `delete` so the schema sees the field as absent rather
  // than as the literal string "undefined".
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

describe("EnvValidationError", () => {
  it("is an Error subclass with the expected name and issues", () => {
    const issues: ReadonlyArray<EnvIssue> = [{ key: "FOO", message: "Required" }];
    const err = new EnvValidationError("boom", issues);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("EnvValidationError");
    expect(err.message).toBe("boom");
    expect(err.issues).toBe(issues);
  });

  it("defaults issues to an empty array", () => {
    const err = new EnvValidationError("boom");
    expect(err.issues).toEqual([]);
  });
});

/**
 * End-to-end suite for the error formatter, exercised through the
 * public {@link createEnv} surface.
 *
 * The internal `maskValue` helper (now module-private) is hard to
 * drive directly without re-introducing a test-only export; the
 * formatter's masking contract is therefore covered by integration
 * tests that assert no secret prefix ever leaks into the rendered
 * message.
 */
describe("error formatting (via createEnv failure path)", () => {
  it("includes the package prefix and fail-fast footer in the message", () => {
    withEnv({}, () => {
      const schema = z.object({ REQUIRED: z.string() });
      let caught: unknown;
      try {
        createEnv(schema);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(EnvValidationError);
      const message = (caught as EnvValidationError).message;
      expect(message).toContain("[agent-env] Environment validation failed");
      expect(message).toContain("Aborting to fail fast.");
    });
  });

  it("lists every missing field and its hint", () => {
    // Explicitly clear the keys the schema checks. CI jobs that hoist
    // synthetic env at job level, or a developer's local shell, can
    // leak GITHUB_TOKEN / RESEND_API_KEY into this test and mask the
    // missing-field path it is asserting.
    withEnv(
      {
        GITHUB_TOKEN: undefined,
        RESEND_API_KEY: undefined,
        RESEND_FROM_ADDRESS: undefined,
        DIGEST_RECIPIENT: undefined,
        MINIMAX_API_KEY: undefined,
        LLM_MODEL_ID: undefined,
      },
      () => {
        const schema = z.object({
          GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
          RESEND_API_KEY: z.string(),
          RESEND_FROM_ADDRESS: z.email(),
        });
        let caught: unknown;
        try {
          createEnv(schema);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(EnvValidationError);
        const message = (caught as EnvValidationError).message;
        expect(message).toContain("GITHUB_TOKEN");
        expect(message).toContain("RESEND_API_KEY");
        expect(message).toContain("RESEND_FROM_ADDRESS");
        expect(message).toContain("fine-grained PAT");
      },
    );
  });

  it("never leaks a 2-character prefix from a secret value", () => {
    // The most important regression test: even if the formatter
    // ever surfaces the input value for a secret key, the masking
    // contract must NOT reveal the secret's first 2 characters,
    // because that narrows the search space dramatically.
    withEnv({ GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz" }, () => {
      const schema = z.object({
        GITHUB_TOKEN: z.number(),
      });
      let caught: unknown;
      try {
        createEnv(schema);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(EnvValidationError);
      const message = (caught as EnvValidationError).message;
      expect(message).not.toContain("ghp_");
      expect(message).toContain("GITHUB_TOKEN");
      expect(message).toContain("Invalid type");
    });
  });
});
