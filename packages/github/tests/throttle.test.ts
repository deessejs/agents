/**
 * Tests for the default throttle handlers.
 *
 * The throttling plugin requires `onRateLimit` and `onSecondaryRateLimit`
 * callbacks at construction time. We verify the defaults behave correctly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EndpointDefaults } from "@octokit/types";

import { __resetSecondaryRetryForTests, defaultThrottleHandlers } from "../src/throttle.js";

function fakeOptions(): Required<EndpointDefaults> {
  return {
    method: "GET",
    url: "/repos/foo/bar/issues",
    headers: { accept: "application/vnd.github+json", "user-agent": "test" },
    request: {},
    baseUrl: "https://api.github.com",
    mediaType: { format: "" as string, previews: [] },
    operationName: "" as string,
    query: "" as string,
  };
}

describe("defaultThrottleHandlers", () => {
  beforeEach(() => {
    __resetSecondaryRetryForTests();
  });

  it("onRateLimit retries when retryCount < 3", () => {
    const logger = { warn: vi.fn() };
    const handlers = defaultThrottleHandlers({ logger });

    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 0)).toBe(true);
    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 1)).toBe(true);
    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 2)).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });

  it("onRateLimit gives up after 3 retries", () => {
    const logger = { warn: vi.fn() };
    const handlers = defaultThrottleHandlers({ logger });

    // First three calls (retryCount 0..2) succeed and log.
    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 0)).toBe(true);
    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 1)).toBe(true);
    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 2)).toBe(true);
    // Calls beyond the maxRetries (retryCount 3,4) still log but return false.
    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 3)).toBe(false);
    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 4)).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(5);
  });

  it("onSecondaryRateLimit always retries", () => {
    const logger = { warn: vi.fn() };
    const handlers = defaultThrottleHandlers({ logger });

    expect(handlers.onSecondaryRateLimit(60, fakeOptions(), {} as never)).toBe(true);
    expect(handlers.onSecondaryRateLimit(60, fakeOptions(), {} as never)).toBe(true);
    expect(handlers.onSecondaryRateLimit(60, fakeOptions(), {} as never)).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });

  it("uses provided maxRetries when configured", () => {
    const logger = { warn: vi.fn() };
    const handlers = defaultThrottleHandlers({ logger, maxRetries: 1 });

    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 0)).toBe(true);
    expect(handlers.onRateLimit(60, fakeOptions(), {} as never, 1)).toBe(false);
  });

  it("uses provided logger when configured", () => {
    const logger = { warn: vi.fn() };
    const handlers = defaultThrottleHandlers({ logger });

    handlers.onRateLimit(60, fakeOptions(), {} as never, 0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("default logger is a no-op when none is configured", () => {
    const handlers = defaultThrottleHandlers();
    // Should not throw — noop logger swallows the message.
    expect(() => handlers.onRateLimit(60, fakeOptions(), {} as never, 0)).not.toThrow();
  });

  it("onSecondaryRateLimit gives up after the secondary retry cap", () => {
    const logger = { warn: vi.fn() };
    const handlers = defaultThrottleHandlers({ logger, secondaryMaxRetries: 2 });
    const opts = fakeOptions();
    // 3 calls under the cap: 1, 2 → retry; 3 → bail.
    expect(handlers.onSecondaryRateLimit(60, opts, {} as never)).toBe(true);
    expect(handlers.onSecondaryRateLimit(60, opts, {} as never)).toBe(true);
    expect(handlers.onSecondaryRateLimit(60, opts, {} as never)).toBe(false);
  });

  it("onSecondaryRateLimit retry count is scoped per (method, url) key", () => {
    const logger = { warn: vi.fn() };
    const handlers = defaultThrottleHandlers({ logger, secondaryMaxRetries: 1 });
    const optsA: Required<EndpointDefaults> = { ...fakeOptions(), url: "/a" };
    const optsB: Required<EndpointDefaults> = { ...fakeOptions(), url: "/b" };
    // Burn the budget for /a.
    expect(handlers.onSecondaryRateLimit(60, optsA, {} as never)).toBe(true);
    expect(handlers.onSecondaryRateLimit(60, optsA, {} as never)).toBe(false);
    // /b is a fresh key — still under the cap.
    expect(handlers.onSecondaryRateLimit(60, optsB, {} as never)).toBe(true);
  });
});
