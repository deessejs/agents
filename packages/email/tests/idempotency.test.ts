import { describe, expect, it } from "vitest";
import { deriveIdempotencyKey } from "../src/idempotency.ts";

describe("deriveIdempotencyKey", () => {
  it("returns a stable key for the same content", () => {
    const opts = {
      to: "user@example.com",
      subject: "Daily digest 2026-10-06",
      html: "<h1>Hello</h1>",
      text: "Hello",
    };
    const k1 = deriveIdempotencyKey(opts);
    const k2 = deriveIdempotencyKey(opts);
    expect(k1).toBe(k2);
  });

  it("returns a different key for different content", () => {
    const a = deriveIdempotencyKey({ to: "x", subject: "A", html: "a", text: "a" });
    const b = deriveIdempotencyKey({ to: "x", subject: "B", html: "a", text: "a" });
    expect(a).not.toBe(b);
  });

  it("handles array recipients (join with comma)", () => {
    const single = deriveIdempotencyKey({ to: "a@x", subject: "S", html: "h", text: "t" });
    const array = deriveIdempotencyKey({ to: ["a@x", "b@x"], subject: "S", html: "h", text: "t" });
    expect(single).not.toBe(array);
  });

  it("uses the digest:send: prefix", () => {
    const k = deriveIdempotencyKey({ to: "a@x", subject: "S", html: "h", text: "t" });
    expect(k).toMatch(/^digest:send:[0-9a-f]{16}$/);
  });

  it("treats missing text the same as empty text", () => {
    const a = deriveIdempotencyKey({ to: "a@x", subject: "S", html: "h" });
    const b = deriveIdempotencyKey({ to: "a@x", subject: "S", html: "h", text: "" });
    expect(a).toBe(b);
  });
});
