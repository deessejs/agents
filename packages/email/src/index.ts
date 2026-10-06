/**
 * @workspace/email — Resend wrapper + React Email templates.
 *
 * Public surface:
 *   - createEmailClient(opts) → { send, sendBatch }
 *   - types (CreateEmailOptions, SendOptions, SendResult, EmailClient)
 *   - deriveIdempotencyKey  — exported for tests only
 *   - buildHeaders          — exported for tests only
 *
 * Templates are re-exported from `./templates` (see
 * packages/email/src/templates/index.ts). They are accessible to
 * consumers via `import { EmailShell } from "@workspace/email/templates"`.
 *
 * No LLM, no Octokit. The package's only job is to keep outbound email
 * headers + idempotency + sender identity consistent.
 */
export { createEmailClient } from "./create-email-client.ts";
export { buildHeaders } from "./headers.ts";
export { deriveIdempotencyKey } from "./idempotency.ts";
export { renderDigest } from "./render-digest.tsx";
export type { RenderedDigest, RenderDigestInput, ResolvedSection } from "./render-digest.tsx";
export type { CreateEmailOptions, SendOptions, SendResult, SendTag, EmailClient } from "./types.ts";
