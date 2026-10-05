import { describe, expect, it } from "vitest";
import { githubSchema } from "../src/schemas/github.ts";

describe("githubSchema", () => {
  it("parses a valid GitHub config with a classic PAT", () => {
    const result = githubSchema.safeParse({
      GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz",
      GITHUB_ORG: "acme",
    });
    expect(result.success).toBe(true);
  });

  it("parses a valid GitHub config with a fine-grained PAT", () => {
    const result = githubSchema.safeParse({
      GITHUB_TOKEN: "github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz",
      GITHUB_ORG: "acme",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a token with an unknown prefix", () => {
    const result = githubSchema.safeParse({
      GITHUB_TOKEN: "totally_fake_token_1234567890",
      GITHUB_ORG: "acme",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a token that is too short", () => {
    const result = githubSchema.safeParse({
      GITHUB_TOKEN: "ghp_short",
      GITHUB_ORG: "acme",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty token", () => {
    const result = githubSchema.safeParse({
      GITHUB_TOKEN: "",
      GITHUB_ORG: "acme",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when GITHUB_ORG is missing", () => {
    const result = githubSchema.safeParse({ GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      githubSchema.parse({
        GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz",
        GITHUB_ORG: "acme",
        EXTRA: "x",
      }),
    ).toThrow(/Unrecognized/);
  });
});
