/**
 * @workspace/email — Resend wrapper + React Email templates.
 *
 * Public surface:
 *   - createEmailClient(opts) → { send }
 *   - renderDigest(input) → { html, text }
 *   - deriveIdempotencyKey  — exported for tests only
 *
 * Templates are re-exported from `./templates`. No LLM, no Octokit.
 */
export { createEmailClient } from "./create-email-client.ts";
export { deriveIdempotencyKey } from "./idempotency.ts";
export { renderDigest } from "./render-digest.tsx";
export type {
  RenderedDigest,
  RenderDigestInput,
  DigestEdition,
  DigestSection,
  DigestItem,
  DigestSource,
} from "./render-digest.tsx";
export type { CreateEmailOptions, SendOptions, SendResult, SendTag, EmailClient } from "./types.ts";
