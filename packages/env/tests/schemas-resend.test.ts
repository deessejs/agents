import { describe, expect, it } from "vitest";
import { resendSchema } from "../src/schemas/resend.ts";

describe("resendSchema", () => {
  it("parses a complete valid Resend config", () => {
    const result = resendSchema.safeParse({
      RESEND_API_KEY: "re_abcdefghijklmnopqrstuv",
      RESEND_FROM_ADDRESS: "agent@example.com",
      RESEND_FROM_NAME: "Acme",
      RESEND_REPLY_TO: "reply@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("applies the default FROM_NAME and accepts a missing REPLY_TO", () => {
    const result = resendSchema.safeParse({
      RESEND_API_KEY: "re_abcdefghijklmnopqrstuv",
      RESEND_FROM_ADDRESS: "agent@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.RESEND_FROM_NAME).toBe("Agent");
      expect(result.data.RESEND_REPLY_TO).toBeUndefined();
    }
  });

  it("rejects a key without the re_ prefix", () => {
    const result = resendSchema.safeParse({
      RESEND_API_KEY: "abc",
      RESEND_FROM_ADDRESS: "agent@example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "RESEND_API_KEY must start with 're_' followed by at least 20 identifier characters",
      );
    }
  });

  it("rejects an re_ prefix that is too short", () => {
    const result = resendSchema.safeParse({
      RESEND_API_KEY: "re_short",
      RESEND_FROM_ADDRESS: "agent@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      resendSchema.parse({
        RESEND_API_KEY: "re_abcdefghijklmnopqrstuv",
        RESEND_FROM_ADDRESS: "agent@example.com",
        EXTRA: "x",
      }),
    ).toThrow(/Unrecognized/);
  });

  it("rejects when RESEND_API_KEY is missing", () => {
    const result = resendSchema.safeParse({
      RESEND_FROM_ADDRESS: "agent@example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("RESEND_API_KEY");
    }
  });

  it("rejects when RESEND_FROM_ADDRESS is missing", () => {
    const result = resendSchema.safeParse({
      RESEND_API_KEY: "re_abcdefghijklmnopqrstuv",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("RESEND_FROM_ADDRESS");
    }
  });
});
