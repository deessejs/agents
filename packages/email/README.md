# `@workspace/email`

Resend wrapper + React Email templates for every agent's outbound mail. The package's only job is to keep email headers, sender identity, idempotency, and template styling consistent across every agent.

## Install

Already wired into the monorepo. Import directly:

```ts
import { createEmailClient } from "@workspace/email";
import { EmailShell, DigestBlock, MetricsTable } from "@workspace/email/templates";
```

## API

### `createEmailClient(opts)` → `{ send, sendBatch }`

```ts
const email = createEmailClient({
  apiKey: process.env.RESEND_API_KEY!, // starts with "re_"
  from: { name: "Technical Analyst", address: "digest@mail.deessejs.com" },
  replyTo: "nesalia.inc@gmail.com",
  unsubscribeBaseUrl: "https://app.deessejs.com",
  unsubscribeMailto: "unsubscribe@mail.deessejs.com",
});

const result = await email.send({
  to: "user@example.com",
  subject: "Daily digest 2026-10-06",
  html: renderedHtml, // pre-rendered by the template
  text: renderedText, // plain-text fallback
  digestId: "d1aabc7e", // → X-Digest-Id header + List-Unsubscribe URL
  tags: [
    { name: "kind", value: "daily" },
    { name: "digest_id", value: "d1aabc7e" },
  ],
});
// → { id: "msg_xyz", idempotencyKey: "digest:send:7a8c1f..." }
```

The wrapper:

- Builds RFC 8058 `List-Unsubscribe: <https endpoint>, <mailto:>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers automatically.
- Derives a stable `idempotencyKey` from (to, subject, html, text) — retries don't double-send.
- Sets `Precedence: bulk` and (when `digestId` is provided) `X-Digest-Id: <digestId>`.
- Throws on Resend errors (no silent failures).

### `sendBatch(emails)`

```ts
await email.sendBatch([
  { to: "a@example.com", subject: "...", html: "..." },
  { to: "b@example.com", subject: "...", html: "..." },
]);
// → ReadonlyArray<SendResult>
```

Per-message idempotency keys are derived as in `send`. Resend's batch endpoint handles the parallelization.

## Templates

```ts
import { render } from "react-email";
import { EmailShell, DigestBlock, MetricsTable } from "@workspace/email/templates";

const html = await render(
  <EmailShell
    subject="Daily digest 2026-10-06"
    header="deessejs · Data as of 2026-10-06 21:30 UTC · Digest ID d1aabc7e"
  >
    <DigestBlock kind="tldr" text="3 PRs merged, 1 incident resolved." />
    <DigestBlock kind="shipped" text="PR #142 — feat: OAuth PKCE support." status="green" />
    <DigestBlock kind="risks" text="PR #1257 open for 18 days." status="red" />
    <DigestBlock kind="watchlist" text="Nothing specific." status="yellow" />
  </EmailShell>,
);
```

### `<EmailShell subject header footer children theme?>`

Top-level layout. Inlines the design tokens' colors as inline CSS (most mail clients strip `<style>` blocks). Supports `light` (default) and `dark` themes; mail clients respect `prefers-color-scheme: dark`.

### `<DigestBlock kind text status?> theme?>`

One section. Drives both the label and the left-border accent color:

- `tldr` → "TL;DR", muted accent
- `shipped` → "Shipped", green accent
- `risks` → "Risks & blockers", red accent
- `watchlist` → "Watchlist for tomorrow", amber accent

If `status` is set, prepends a 🟢 / 🟡 / 🔴 emoji to the header.

The `text` body is auto-escaped by React when it goes through the JSX text node. **Never** pass raw LLM output here — run it through `@workspace/format/BANNED` first to catch XSS payloads (`<script>`, `javascript:`, `data:text`, `[...](mailto:...)`) before render.

### `<MetricsTable title rows theme?>`

Week-over-week table for the weekly digest. Each row carries a `tone: "good" | "bad" | "neutral"` so the table's color encoding matches editorial intent (down cycle time is "good", up dependabot count is "bad").

`describeDelta(thisValue, lastValue)` is a pure helper that returns a `@workspace/format/formatNumber`-formatted delta or `null` if the values are equal or non-numeric.

### `tokens`

Hand-picked design tokens. Two themes (`light`, `dark`), inline-CSS only, no Tailwind runtime. RAG colors match the editorial principle "always search for yellow/red signals" (green is intentionally muted).

## Dependencies (catalog)

- `resend: ^6.32.0`
- `react-email: ^6.9.1` (unified package — `@react-email/components` is being deprecated; v6+ ships components + render in one)
- `react: ^19.0.0`
- `react-dom: ^19.0.0`
- `@workspace/format: workspace:*` (peer dep — used by the template components for `escapeHtml` + `formatNumber`)
- `zod: ^4.1.8` (reserved; not used yet)

Dev:

- `@types/react: ^19.0.0`
- `@types/react-dom: ^19.0.0`
- `@types/node: ^22.0.0`
- `@workspace/tsconfig: workspace:*`
- `vitest: ^2.1.0`

## What this package does NOT do

- No LLM / Octokit / no runtime services (besides Resend).
- No i18n — locked English-only for v1.
- No image generation, no file attachments (deferred to v2).
- No send-grid / SES / Postmark fallback — Resend is the only provider in v1 per the locked decision.

## License

MIT
