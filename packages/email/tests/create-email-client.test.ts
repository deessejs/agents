import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stub the `resend` SDK so tests don't hit the network. The tests
 * verify that our wrapper passes the correct headers + idempotency key
 * to Resend, not that Resend itself works.
 */
const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

// Import after the mock so the wrapper picks up the stubbed Resend.
const { createEmailClient } = await import("../src/create-email-client.ts");

const baseOpts = {
  apiKey: "re_test_key",
  from: { name: "Technical Analyst", address: "digest@mail.deessejs.com" },
  replyTo: "nesalia.inc@gmail.com",
  unsubscribeBaseUrl: "https://app.deessejs.com",
  unsubscribeMailto: "unsubscribe@mail.deessejs.com",
} as const;

describe("createEmailClient", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "msg_xyz" }, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws if the API key doesn't start with 're_'", () => {
    expect(() => createEmailClient({ ...baseOpts, apiKey: "sk-invalid" })).toThrow(
      /apiKey must start with 're_'/,
    );
  });

  it("sends a message and returns the id + idempotencyKey", async () => {
    const client = createEmailClient(baseOpts);
    const result = await client.send({
      to: "user@example.com",
      subject: "Daily digest 2026-10-06",
      html: "<p>Hello</p>",
      text: "Hello",
      digestId: "d1aabc7e",
    });
    expect(result.id).toBe("msg_xyz");
    expect(result.idempotencyKey).toMatch(/^digest:send:[0-9a-f]{16}$/);
  });

  it("passes the RFC 8058 List-Unsubscribe header", async () => {
    const client = createEmailClient(baseOpts);
    await client.send({
      to: "user@example.com",
      subject: "S",
      html: "h",
      digestId: "abc123",
    });
    const call = sendMock.mock.calls[0]?.[0] as { headers: Record<string, string> };
    expect(call.headers["List-Unsubscribe"]).toBe(
      "<https://app.deessejs.com/unsubscribe/abc123>, <mailto:unsubscribe@mail.deessejs.com>",
    );
    expect(call.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(call.headers["X-Digest-Id"]).toBe("abc123");
    expect(call.headers["Precedence"]).toBe("bulk");
  });

  it("throws when Resend returns an error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "quota exceeded" } });
    const client = createEmailClient(baseOpts);
    await expect(client.send({ to: "x@x", subject: "S", html: "h" })).rejects.toThrow(
      /quota exceeded/,
    );
  });

  it("throws when Resend returns neither data nor error", async () => {
    sendMock.mockResolvedValue({ data: null, error: null });
    const client = createEmailClient(baseOpts);
    await expect(client.send({ to: "x@x", subject: "S", html: "h" })).rejects.toThrow(
      /returned no data and no error/,
    );
  });

  it("sends batches in parallel (one Resend call per message)", async () => {
    const client = createEmailClient(baseOpts);
    const results = await client.sendBatch([
      { to: "a@x", subject: "S1", html: "h1" },
      { to: "b@x", subject: "S2", html: "h2" },
      { to: "c@x", subject: "S3", html: "h3" },
    ]);
    expect(results).toHaveLength(3);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });
});
