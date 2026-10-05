import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEnv } from "../src/create-env.ts";
import { EnvValidationError } from "../src/error.ts";

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

describe("createEnv", () => {
  it("returns a parsed object when the schema matches", () => {
    withEnv({ FOO: "bar" }, () => {
      // We don't use .strict() here because process.env has many
      // unrelated keys in the test runner.
      const schema = z.object({ FOO: z.string() });
      const env = createEnv(schema);
      expect(env.FOO).toBe("bar");
    });
  });

  it("throws EnvValidationError when a required field is missing", () => {
    withEnv({}, () => {
      const schema = z.object({ REQUIRED: z.string() });
      expect(() => createEnv(schema)).toThrow(EnvValidationError);
    });
  });

  it("throws when a field has the wrong format", () => {
    withEnv({ EMAIL: "not-an-email" }, () => {
      const schema = z.object({ EMAIL: z.email() });
      expect(() => createEnv(schema)).toThrow(EnvValidationError);
    });
  });

  it("infers the return type from the schema", () => {
    withEnv({ COUNT: "42" }, () => {
      const schema = z.object({
        COUNT: z.coerce.number(),
        NAME: z.string().default("anon"),
      });
      const env = createEnv(schema);
      // The TypeScript compiler asserts the next two lines are well-typed.
      const count: number = env.COUNT;
      const name: string = env.NAME;
      expect(count).toBe(42);
      expect(name).toBe("anon");
    });
  });

  it("freezes the returned object so mutations throw in strict mode", () => {
    withEnv({ FOO: "bar" }, () => {
      const schema = z.object({ FOO: z.string() });
      const env = createEnv(schema);
      expect(Object.isFrozen(env)).toBe(true);
      // Strict mode throws TypeError on mutation of a frozen object.
      expect(() => {
        (env as { FOO: string }).FOO = "baz";
      }).toThrow(TypeError);
    });
  });
});
