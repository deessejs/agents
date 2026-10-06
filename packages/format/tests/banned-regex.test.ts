import { describe, expect, it } from "vitest";
import { BANNED } from "../src/banned-regex.ts";

describe("BANNED regex", () => {
  it("flags <script> tags (any case)", () => {
    expect(BANNED.test("<script>")).toBe(true);
    expect(BANNED.test("<SCRIPT>")).toBe(true);
    expect(BANNED.test("<Script>alert(1)</script>")).toBe(true);
    expect(BANNED.test("before <script>after")).toBe(true);
  });

  it("flags javascript: scheme", () => {
    expect(BANNED.test("javascript:alert(1)")).toBe(true);
    expect(BANNED.test("JAVASCRIPT:")).toBe(true);
  });

  it("flags data:text/html URIs", () => {
    expect(BANNED.test("data:text/html,<b>x</b>")).toBe(true);
    expect(BANNED.test("DATA:TEXT/PLAIN,foo")).toBe(true);
  });

  it("flags markdown mailto: links", () => {
    expect(BANNED.test("[click here](mailto:attacker@example.com)")).toBe(true);
  });

  it("allows safe markdown + safe URLs", () => {
    expect(BANNED.test("## Hello")).toBe(false);
    expect(BANNED.test("[docs](https://example.com)")).toBe(false);
    expect(BANNED.test("plain text")).toBe(false);
    expect(BANNED.test("")).toBe(false);
  });

  it("is case-insensitive (i flag)", () => {
    expect(BANNED.test("JAVASCRIPT:alert(1)")).toBe(true);
    expect(BANNED.test("Data:Text/plain")).toBe(true);
  });
});
