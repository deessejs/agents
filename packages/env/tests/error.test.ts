import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEnv } from "../src/create-env.ts";
import { EnvValidationError, maskValue } from "../src/error.ts";
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
  Object.assign(process.env, env);
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
 * Table-driven suite for `maskValue` behavior across key categories.
 *
 * Each row is `key × value → expected`. We cover all four branches:
 *  - secret key → `[REDACTED]`
 *  - non-secret with a long string → 29-char prefix + ellipsis
 *  - non-secret with a short string → JSON-stringified (quoted)
 *  - `undefined` and `null` → literal `"undefined"` / `"null"`
 */
describe("maskValue (table-driven)", () => {
  interface Case {
    name: string;
    key: string;
    value: unknown;
    expected: string;
  }

  const cases: ReadonlyArray<Case> = [
    {
      name: "GITHUB_TOKEN secret renders as [REDACTED]",
      key: "GITHUB_TOKEN",
      value: "ghp_abcdefghijklmnopqrstuvwxyz",
      expected: "[REDACTED]",
    },
    {
      name: "RESEND_API_KEY secret renders as [REDACTED]",
      key: "RESEND_API_KEY",
      value: "re_abcdefghijklmnopqrstuv",
      expected: "[REDACTED]",
    },
    {
      name: "non-secret long value is truncated to 29 chars + ellipsis",
      key: "LONG_NAME",
      value: "x".repeat(60),
      expected: `${"x".repeat(29)}...`,
    },
    {
      name: "non-secret short value is returned as-is",
      key: "SHORT_NAME",
      value: "hello",
      expected: "hello",
    },
    {
      name: "non-secret non-string value is JSON-stringified",
      key: "ANY_KEY",
      value: { foo: "bar" },
      expected: '{"foo":"bar"}',
    },
    {
      name: "undefined renders as the literal 'undefined'",
      key: "ANY_KEY",
      value: undefined,
      expected: "undefined",
    },
    {
      name: "null renders as the literal 'null'",
      key: "ANY_KEY",
      value: null,
      expected: "null",
    },
    {
      name: "secret with empty string still renders as [REDACTED]",
      key: "GITHUB_TOKEN",
      value: "",
      expected: "[REDACTED]",
    },
    {
      name: "secret with non-string still renders as [REDACTED]",
      key: "RESEND_API_KEY",
      value: 12345,
      expected: "[REDACTED]",
    },
  ];

  for (const c of cases) {
    it(`mask: ${c.name}`, () => {
      expect(maskValue(c.key, c.value)).toBe(c.expected);
    });
  }
});

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
    withEnv({}, () => {
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
    });
  });

  it("never leaks a 2-character prefix from a secret value", () => {
    // The most important regression test: even when the formatter
    // does include a `Got:` line (i.e., Zod populated `input`), the
    // masked value must NOT reveal the secret's first 2 characters,
    // because that narrows the search space dramatically. The
    // table-driven `maskValue` tests cover the [REDACTED] rendering
    // directly; here we just assert no leak through the formatter.
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
      // No 2-char prefix from the secret should leak.
      expect(message).not.toContain("ghp_");
      // But it should mention the variable name + the type.
      expect(message).toContain("GITHUB_TOKEN");
      expect(message).toContain("Invalid type");
    });
  });
});
