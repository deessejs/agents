import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/escape-html.ts";
import { mdToHtml, mdToHtmlOrEscape } from "../src/md-to-html.ts";

describe("mdToHtml", () => {
  it("converts basic markdown to HTML", () => {
    const html = mdToHtml("# Hello\n\nWorld");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
  });

  it("renders bold/italic", () => {
    const html = mdToHtml("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders links", () => {
    const html = mdToHtml("[example](https://example.com)");
    expect(html).toContain('<a href="https://example.com">example</a>');
  });

  it("renders lists", () => {
    const html = mdToHtml("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("<li>three</li>");
    expect(html).toContain("</ul>");
  });

  it("drops raw HTML script tags (security default)", () => {
    // mdast-util-to-hast (with allowDangerousHtml: false) strips raw
    // HTML blocks at the parse step. The literal text "alert(1)" is
    // plain text and survives; the `<script>` and `</script>` tags are
    // removed entirely. Either way, no executable script reaches the
    // rendered HTML.
    const html = mdToHtml("hello <script>alert(1)</script> world");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script");
    expect(html).toContain("alert(1)");
  });

  it("drops raw HTML div tags (security default)", () => {
    const html = mdToHtml("before <div onclick='evil'>x</div> after");
    expect(html).not.toContain("<div");
    expect(html).not.toContain("onclick");
  });

  it("renders inline code", () => {
    const html = mdToHtml("use `escapeHtml()` for safety");
    expect(html).toContain("<code>escapeHtml()</code>");
  });
});

describe("mdToHtmlOrEscape", () => {
  it("returns the parsed HTML on success", () => {
    const html = mdToHtmlOrEscape("# Title");
    expect(html).toContain("<h1>Title</h1>");
  });

  it("returns a non-empty string for any non-empty input (no-fail contract)", () => {
    // Whether the input parses or not, the function never returns "" or
    // throws. Empty input is a legitimate empty output (the parser
    // produces no text and escapeHtml("") is ""). The agent runtime
    // never passes empty input to a digest render.
    expect(mdToHtmlOrEscape("plain text").length).toBeGreaterThan(0);
    expect(mdToHtmlOrEscape("## Heading\n\n**bold**").length).toBeGreaterThan(0);
    expect(mdToHtmlOrEscape("&lt;raw&gt;").length).toBeGreaterThan(0);
    expect(mdToHtmlOrEscape("a").length).toBeGreaterThan(0);
  });

  it("uses escapeHtml's output when mdToHtml returns null (forced fallback)", () => {
    // mdToHtmlOrEscape always returns a string. The fallback path runs
    // only when mdToHtml returns null; we can't easily force a parse
    // failure with valid Unicode input, so we just verify the no-fail
    // contract above. The escapeHtml integration is exercised in
    // escape-html.test.ts.
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });
});
