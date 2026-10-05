import { describe, expect, it } from "vitest";
import { vercelSchema } from "../src/schemas/vercel.ts";

describe("vercelSchema", () => {
  it("parses an object that includes Vercel env vars", () => {
    const result = vercelSchema.safeParse({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_URL: "my-app.vercel.app",
      VERCEL_REGION: "iad1",
      VERCEL_GIT_COMMIT_SHA: "abc123",
      VERCEL_GIT_COMMIT_MESSAGE: "feat: ship",
    });
    expect(result.success).toBe(true);
  });

  it("parses an empty object because every field is optional", () => {
    const result = vercelSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects an unknown VERCEL_ENV value", () => {
    const result = vercelSchema.safeParse({ VERCEL_ENV: "banana" });
    expect(result.success).toBe(false);
  });
});
