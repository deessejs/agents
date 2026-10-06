/**
 * Negative allowlist regex for LLM-derived strings.
 *
 * Any match aborts the digest render. Patterns covered:
 *   - `<script` (case-insensitive) — flag opening script tags
 *   - `javascript:` — flag JS URI schemes (incl. data:text/html which is
 *     also browser-executable). We use a single regex group so the match
 *     is grep-amenable in CI logs.
 *   - `data:text/html` — covered by the `data:text` branch
 *   - `[label](mailto:...)` — common XSS-markdown format; the link target
 *     starts with `[...]` and `(` is followed by `...@`
 *
 * This regex is run against strings BEFORE they are HTML-escaped, so the
 * patterns look at raw markdown. After the regex passes, the string is
 * safe to pass through {@link escapeHtml}.
 */
export const BANNED = /(<script|javascript:|data:text|\[[^\]]*\]\([^)]*@)/i;
