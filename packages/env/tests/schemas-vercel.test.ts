import { describe, expect, it } from "vitest";
import { vercelSchema } from "../src/schemas/vercel.ts";

describe("vercelSchema", () => {
  // vercelSchema is entirely optional — every field defaults or accepts
  // undefined, so there is no "required-field-missing" case to assert.
  // The empty-payload test below covers the all-optional shape.
  it.skip("placeholder for required-field-missing (n/a — schema is all-optional)", () => {
    expect(true).toBe(true);
  });

  it("parses an object that includes Vercel env vars", () => {
    const result = vercelSchema.safeParse({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_URL: "https://my-app.vercel.app",
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

  it("rejects an invalid VERCEL_URL", () => {
    const result = vercelSchema.safeParse({ VERCEL_URL: "not a url" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() => vercelSchema.parse({ VERCEL_URL: "https://x.example.com", EXTRA: "x" })).toThrow(
      /Unrecognized/,
    );
  });
});
