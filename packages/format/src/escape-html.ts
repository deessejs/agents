/**
 * Escape every character that has special meaning in HTML5 text content
 * or attribute values. The order matters: `&` must run first, otherwise
 * the `&amp;`, `&lt;`, etc. we emit would themselves be re-escaped.
 *
 * This is intentionally minimal — it does NOT understand HTML. Use
 * {@link mdToHtml} for markdown→HTML sanitization. Callers that need
 * attribute-context escaping (quoted vs unquoted) should wrap the result
 * in `"..."` themselves.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
