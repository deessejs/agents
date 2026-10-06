/**
 * Convert a markdown string to sanitized HTML.
 *
 * Pipeline: markdown → mdast (via `unified` + `remark-parse`) →
 *           hast (via {@link importMDastToHast}) → HTML string
 *           (via {@link importHastToHTML}).
 *
 * Raw HTML in the source markdown is **dropped** by mdast-util-to-hast
 * (default `allowDangerousHtml: false`). This means the output is safe
 * to render — callers don't need {@link escapeHtml} on the result.
 *
 * If the input is not valid markdown, returns null and emits nothing.
 * Callers should fall back to `escapeHtml(input)` in that case.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import { toHast } from "mdast-util-to-hast";
import { toHtml } from "hast-util-to-html";

import { escapeHtml } from "./escape-html.ts";

export function mdToHtml(md: string): string | null {
  let mdast;
  try {
    mdast = unified().use(remarkParse).parse(md);
  } catch {
    return null;
  }

  // allowDangerousHtml: false (default) — raw HTML nodes in markdown are
  // converted to text nodes, so a malicious payload like
  // `<scr + ipt>alert(1)</scr + ipt>` is rendered as the literal text
  // "<scr + ipt>alert(1)</scr + ipt>" (split here to avoid closing
  // the JSDoc), which is then HTML-escaped by hast-util-to-html.
  // Defence in depth: even if a downstream consumer bypasses
  // hast-util-to-html, the output is still treated as untrusted text.
  const hast = toHast(mdast, { allowDangerousHtml: false });
  return toHtml(hast);
}

/**
 * Escape-or-convert: try mdToHtml first; fall back to escapeHtml on parse
 * failure. Useful for LLM output where the model may emit half-broken
 * markdown.
 */
export function mdToHtmlOrEscape(md: string): string {
  const html = mdToHtml(md);
  return html ?? escapeHtml(md);
}
