import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/escape-html.ts";

describe("escapeHtml", () => {
  it("escapes & first (so it isn't double-escaped)", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes both quote characters", () => {
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("escapes the canonical XSS payload", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
    );
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
    expect(escapeHtml("")).toBe("");
  });

  it("escapes all five entities in one string", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("does not double-escape (one-pass replace)", () => {
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("preserves whitespace and unicode", () => {
    expect(escapeHtml("héllo\nwörld")).toBe("héllo\nwörld");
    expect(escapeHtml("日本語")).toBe("日本語");
  });
});
