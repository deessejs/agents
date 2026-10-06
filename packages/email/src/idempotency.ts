/**
 * Idempotency-key derivation for Resend's `idempotencyKey` header.
 *
 * Format: `digest:<schedule>:<YYYY-MM-DD>:<sha256(subject|html|text).slice(0, 16)>`
 *
 * The key is derived from the message content so that:
 *   - Same content → same key → Resend deduplicates on retry
 *   - Different content → different key → Resend treats as a new send
 *   - Same content + different digestId → different key (digestId is part of html)
 *
 * 16 hex chars = 64 bits of collision space, which is plenty for a
 * daily digest (worst case: a few hundred per org per year).
 *
 * This is exported for testing only — production callers go through
 * `createEmailClient.send()` which derives the key automatically.
 */
import { createHash } from "node:crypto";
import type { SendOptions } from "./types.ts";

export function deriveIdempotencyKey(options: SendOptions): string {
  const to = Array.isArray(options.to) ? options.to.join(",") : options.to;
  const payload = [to, options.subject, options.html, options.text ?? ""].join("|");
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  // Note: we intentionally don't include the kind/digestId in the
  // key — content is the source of truth. The X-Digest-Id header
  // (set by buildHeaders) carries the semantic identity separately.
  return `digest:send:${hash}`;
}
