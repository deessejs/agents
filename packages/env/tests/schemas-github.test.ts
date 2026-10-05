import { describe, expect, it } from "vitest";
import { githubSchema } from "../src/schemas/github.ts";

describe("githubSchema", () => {
  it("parses a valid GitHub config", () => {
    const result = githubSchema.safeParse({
      GITHUB_TOKEN: "ghp_test",
      GITHUB_ORG: "acme",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty token", () => {
    const result = githubSchema.safeParse({
      GITHUB_TOKEN: "",
      GITHUB_ORG: "acme",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain("GITHUB_TOKEN is required");
    }
  });

  it("rejects when GITHUB_ORG is missing", () => {
    const result = githubSchema.safeParse({ GITHUB_TOKEN: "ghp_test" });
    expect(result.success).toBe(false);
  });
});
