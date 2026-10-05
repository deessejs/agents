import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "../src/parse-env.ts";
import { EnvValidationError } from "../src/error.ts";

describe("parseEnv", () => {
  it("returns the parsed object when the input matches", () => {
    const schema = z.object({ NAME: z.string() }).strict();
    const result = parseEnv({ NAME: "ada" }, schema);
    expect(result).toEqual({ NAME: "ada" });
  });

  it("throws EnvValidationError when the input does not match", () => {
    const schema = z.object({ NAME: z.string() }).strict();
    expect(() => parseEnv({ NAME: 42 }, schema)).toThrow(EnvValidationError);
  });
});
