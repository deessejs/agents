/**
 * @workspace/format — shared formatters + HTML safety for agent output.
 *
 * Public surface (Phase 2 — locked 2026-10-06):
 *   - escapeHtml(s)        — escape an untrusted string for HTML text/attr
 *   - BANNED               — negative allowlist regex for LLM output
 *   - mdToHtml(md)         — markdown → HTML sanitized (raw HTML dropped)
 *   - mdToHtmlOrEscape(md) — try mdToHtml, fall back to escapeHtml
 *   - relativeTime(date)   — "3 hours ago" / "in 2 days"
 *   - formatNumber(n)      — "1.5K" / "2.3M"
 *   - formatDuration(ms)   — "1d 4h" / "2h 30m" / "45s"
 *   - formatBytes(n)       — "12.5 MB"
 *   - formatPercent(frac)  — "12.5%" (input in [0, 1])
 *
 * No LLM, no Octokit, no React. The package's only purpose is to keep
 * digest output consistent across every agent.
 */
export { escapeHtml } from "./escape-html.ts";
export { BANNED } from "./banned-regex.ts";
export { mdToHtml, mdToHtmlOrEscape } from "./md-to-html.ts";
export { relativeTime } from "./date.ts";
export { formatNumber } from "./number.ts";
export { formatDuration } from "./duration.ts";
export { formatBytes } from "./bytes.ts";
export { formatPercent } from "./percent.ts";
