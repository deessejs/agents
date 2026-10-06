import { describe, expect, it } from "vitest";
import { buildHeaders } from "../src/headers.ts";

const baseInput = {
  apiKey: "re_test_key",
  from: { name: "Technical Analyst", address: "digest@mail.deessejs.com" },
  replyTo: "nesalia.inc@gmail.com",
  unsubscribeBaseUrl: "https://app.deessejs.com",
  unsubscribeMailto: "unsubscribe@mail.deessejs.com",
};

describe("buildHeaders", () => {
  it("always sets Precedence: bulk", () => {
    const headers = buildHeaders(baseInput);
    expect(headers["Precedence"]).toBe("bulk");
  });

  it("sets X-Digest-Id when digestId is provided", () => {
    const headers = buildHeaders({ ...baseInput, digestId: "d1aabc7e" });
    expect(headers["X-Digest-Id"]).toBe("d1aabc7e");
  });

  it("omits X-Digest-Id when digestId is not provided", () => {
    const headers = buildHeaders(baseInput);
    expect(headers["X-Digest-Id"]).toBeUndefined();
  });

  it("sets List-Unsubscribe with HTTPS + mailto endpoints (RFC 8058)", () => {
    const headers = buildHeaders({ ...baseInput, digestId: "abc123" });
    expect(headers["List-Unsubscribe"]).toBe(
      "<https://app.deessejs.com/unsubscribe/abc123>, <mailto:unsubscribe@mail.deessejs.com>",
    );
  });

  it("sets List-Unsubscribe-Post: List-Unsubscribe=One-Click (RFC 8058)", () => {
    const headers = buildHeaders(baseInput);
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("falls back to base unsubscribe URL when no digestId", () => {
    const headers = buildHeaders(baseInput);
    expect(headers["List-Unsubscribe"]).toContain("https://app.deessejs.com/unsubscribe>");
  });
});
