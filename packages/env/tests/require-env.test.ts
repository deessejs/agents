import { describe, expect, it } from "vitest";
import { requireEnv } from "../src/require-env.ts";
import { EnvValidationError } from "../src/error.ts";

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

describe("requireEnv", () => {
  it("returns the value when the variable is set", () => {
    withEnv({ REQUIRE_ENV_TEST: "hello" }, () => {
      expect(requireEnv("REQUIRE_ENV_TEST")).toBe("hello");
    });
  });

  it("throws EnvValidationError when the variable is missing", () => {
    withEnv({}, () => {
      expect(() => requireEnv("REQUIRE_ENV_MISSING")).toThrow(EnvValidationError);
    });
  });
});
