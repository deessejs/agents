import { describe, expect, it } from "vitest";
import { isRetryable } from "../src/error.ts";

/**
 * Table-driven suite for `isRetryable` over every supported retryable
 * pattern and a representative sample of non-retryable cases.
 */
describe("isRetryable (table-driven)", () => {
  interface Case {
    name: string;
    error: unknown;
    expected: boolean;
  }

  const retryableError = new Error("upstream 503 service unavailable");
  const rateLimitError = new Error("rate limit reached, slow down");
  const timeoutError = new Error("request timeout after 30s");
  const networkError = new Error("ECONNRESET network error");
  const overloadedError = new Error("anthropic overloaded, please retry");
  const notFoundError = new Error("404 not found");
  const validationError = new Error("invalid prompt: missing field");

  const apicallError = new Error("AI SDK: upstream 5xx");
  Object.defineProperty(apicallError, "name", { value: "APICallError" });

  const overloadError = new Error("overloaded");
  Object.defineProperty(overloadError, "name", { value: "OverloadError" });

  const loadKeyError = new Error("missing api key");
  Object.defineProperty(loadKeyError, "name", { value: "LoadAPIKeyError" });

  const cases: ReadonlyArray<Case> = [
    // Retryable: HTTP status code patterns
    { name: "429 in message", error: new Error("got 429 from upstream"), expected: true },
    { name: "500 in message", error: new Error("500"), expected: true },
    { name: "502 in message", error: new Error("bad gateway 502"), expected: true },
    { name: "503 in message", error: retryableError, expected: true },
    { name: "504 in message", error: new Error("gateway timeout 504"), expected: true },

    // Retryable: keyword patterns
    { name: "rate limit keyword", error: rateLimitError, expected: true },
    { name: "timeout keyword", error: timeoutError, expected: true },
    { name: "network keyword", error: networkError, expected: true },
    { name: "overloaded keyword", error: overloadedError, expected: true },

    // Retryable: AI SDK error class names
    { name: "APICallError", error: apicallError, expected: true },
    { name: "OverloadError", error: overloadError, expected: true },

    // Non-retryable
    { name: "404 not found", error: notFoundError, expected: false },
    { name: "validation error", error: validationError, expected: false },
    { name: "LoadAPIKeyError (auth)", error: loadKeyError, expected: false },
    { name: "plain non-Error", error: "string error", expected: false },
    { name: "null", error: null, expected: false },
    { name: "undefined", error: undefined, expected: false },
  ];

  for (const c of cases) {
    it(`${c.name} → ${c.expected}`, () => {
      expect(isRetryable(c.error)).toBe(c.expected);
    });
  }
});
