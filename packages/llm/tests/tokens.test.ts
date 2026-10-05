import { describe, expect, it } from "vitest";

import { countTokens } from "../src/tokens.ts";

describe("countTokens", () => {
  it("returns a positive count for ASCII text", () => {
    const count = countTokens("Hello, world!");
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(10);
  });

  it("returns zero for the empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("returns a larger count for longer text", () => {
    const short = countTokens("hi");
    const long = countTokens(
      "This is a much longer sentence that contains many more tokens than the short greeting above.",
    );
    expect(long).toBeGreaterThan(short);
  });

  it("is synchronous (returns a number, not a Promise)", () => {
    const result = countTokens("sync check");
    expect(typeof result).toBe("number");
    // The runtime is exercised by the surrounding describe(); the type
    // check above is the explicit signal.
  });
});
