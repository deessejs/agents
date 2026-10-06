# `@workspace/format`

Shared formatters + HTML safety for every agent's user-facing strings. No LLM, no Octokit, no React — just deterministic text shaping so the same input always produces the same output across every agent.

## Install

Already wired into the monorepo. Import directly:

```ts
import {
  escapeHtml,
  BANNED,
  mdToHtml,
  mdToHtmlOrEscape,
  relativeTime,
  formatNumber,
  formatDuration,
  formatBytes,
  formatPercent,
} from "@workspace/format";
```

## API

### `escapeHtml(s: string): string`

Escapes every character with special HTML meaning (`& < > " '`). The `&` replace is first to avoid double-escaping.

```ts
escapeHtml('<script>alert("xss")</script>');
// → "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
```

The escape is a one-pass replace. If you call `escapeHtml` on already-escaped text, you'll double-escape. Don't do that.

### `BANNED: RegExp`

Negative allowlist for LLM-derived strings. Run **before** HTML escaping.

```ts
if (BANNED.test(section.text)) {
  throw new Error(`Section "${section.kind}" contains banned content`);
}
section.text = escapeHtml(section.text);
```

Patterns covered (case-insensitive):

- `<script` — flag opening script tags
- `javascript:` — flag JS URI schemes
- `data:text` — flag `data:text/html` (and `data:text/...` more generally)
- `[…](mailto:…)` — flag markdown mailto links

### `mdToHtml(md: string): string | null`

Convert markdown to sanitized HTML.

```ts
const html = mdToHtml("# Title\n\n**bold** and [link](https://example.com)");
// → "<h1>Title</h1>\n<p><strong>bold</strong> and <a href=\"https://example.com\">link</a></p>"
```

Returns `null` on parse failure — use `mdToHtmlOrEscape` for a no-fail alternative.

Raw HTML in the markdown source is converted to text content (then escaped by the renderer), so `<script>alert(1)</script>` in the source becomes the literal text "&lt;script&gt;alert(1)&lt;/script&gt;". No XSS surface.

### `mdToHtmlOrEscape(md: string): string`

Try `mdToHtml`; fall back to `escapeHtml(md)` on parse failure. Use this when the input is LLM output (which may be half-broken).

### `relativeTime(date: Date): string`

"3 hours ago" / "in 2 days". Thin wrapper over `date-fns/formatDistanceToNow` with `addSuffix: true`. Currently en-US only.

```ts
relativeTime(new Date(Date.now() - 3 * 3_600_000)); // → "3 hours ago"
```

### `formatNumber(n: number): string`

Compact human form. "1.5K" / "2.3M" / "1.5B".

```ts
formatNumber(1_500); // → "1.5K"
formatNumber(2_300_000); // → "2.3M"
formatNumber(-13_200); // → "-13.2K"
formatNumber(NaN); // → "0"
```

### `formatDuration(ms: number): string`

"45s" / "1m 30s" / "2h" / "1d 4h". Throws `RangeError` on negative or non-finite input.

```ts
formatDuration(45_000); // → "45s"
formatDuration(3_900_000); // → "1h 5m"
formatDuration(100_000_000); // → "1d 3h"
```

### `formatBytes(bytes: number): string`

SI units (powers of 1000), matching `ls -h` and most release-asset dashboards. "1.5 KB" / "12.5 MB" / "1.0 GB". Throws on negative or non-finite.

```ts
formatBytes(1_500); // → "1.5 KB"
formatBytes(12_500_000); // → "12.5 MB"
```

For powers-of-1024 (IEC), use `KiB`/`MiB` manually — this package ships SI only.

### `formatPercent(fraction: number): string`

Fraction in `[0, 1]` → "12.5%" / "100%". Throws on out-of-range or non-finite.

```ts
formatPercent(0.125); // → "12.5%"
formatPercent(1); // → "100%"
formatPercent(0.1234); // → "12.3%"  (rounds to 1 decimal)
```

## Dependencies (catalog)

- `date-fns: ^4.4.0`
- `mdast-util-to-hast: ^13.2.1`
- `hast-util-to-html: ^9.0.5`
- `unified: ^11.0.5`
- `remark-parse: ^11.0.0`
- `zod: ^4.1.8` (reserved; not used yet — leave for future zod-input helpers)

Dev:

- `@types/hast: ^3.0.5`
- `@types/mdast: ^4.0.4`
- `@types/node: ^22.0.0`
- `@workspace/tsconfig: workspace:*`
- `vitest: ^2.1.0`

## What this package does NOT do

- No React/JSX rendering — that's `@workspace/email/templates`.
- No email-specific header logic (RFC 8058 etc.) — that's `@workspace/email`.
- No i18n — locked English-only for v1.
- No LLM / Octokit / no runtime services.
- No memory or caching — pure functions only.

## License

MIT
