/**
 * Build the agent's email client. This is the **only** place the agent
 * touches Resend — every other module consumes the returned object's
 * `.send(...)` / `.sendBatch(...)` methods, which enforce the project's
 * header conventions and idempotency-key contract.
 *
 * Header conventions enforced by the wrapper:
 *   - `List-Unsubscribe`     — RFC 8058 one-click: HTTPS endpoint + mailto
 *   - `List-Unsubscribe-Post` — "List-Unsubscribe=One-Click" per RFC 8058
 *   - `Precedence: bulk`     — tell mail clients this is bulk mail
 *   - `X-Digest-Id`          — operator-friendly debug header
 *
 * The wrapper does **not** strip the LLM-derived body — that's the
 * renderer's job (see {@link ./templates/email-shell.tsx}).
 */

import { Resend } from "resend";
import type { CreateEmailOptions, EmailClient, SendOptions, SendResult } from "./types.ts";
import { buildHeaders } from "./headers.ts";
import { deriveIdempotencyKey } from "./idempotency.ts";

export function createEmailClient(opts: CreateEmailOptions): EmailClient {
  if (!opts.apiKey.startsWith("re_")) {
    throw new Error("createEmailClient: apiKey must start with 're_' (Resend API keys always do).");
  }

  const resend = new Resend(opts.apiKey);

  async function send(
    args: SendOptions,
    deps: { idempotencyKey?: string } = {},
  ): Promise<SendResult> {
    const from = `${opts.from.name} <${opts.from.address}>`;
    // Conditional spread keeps `digestId` absent (not `undefined`) when
    // not provided, so exactOptionalPropertyTypes is satisfied.
    const headers = buildHeaders(
      args.digestId !== undefined ? { ...opts, digestId: args.digestId } : opts,
    );
    const idemKey = deps.idempotencyKey ?? deriveIdempotencyKey(args);

    const { data, error } = await resend.emails.send(
      {
        from,
        to: Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        html: args.html,
        // `text` and `tags` are optional in our SendOptions but the
        // Resend SDK's typing requires them to be absent (not
        // undefined) when unset. Conditional spread keeps
        // exactOptionalPropertyTypes satisfied.
        ...(args.text !== undefined ? { text: args.text } : {}),
        ...(opts.replyTo !== undefined ? { replyTo: opts.replyTo } : {}),
        headers,
        ...(args.tags !== undefined ? { tags: [...args.tags] } : {}),
      },
      { idempotencyKey: idemKey },
    );

    if (error) {
      throw new Error(`Resend send failed (idempotencyKey=${idemKey}): ${error.message}`);
    }
    if (!data) {
      throw new Error(`Resend returned no data and no error (idempotencyKey=${idemKey})`);
    }
    return { id: data.id, idempotencyKey: idemKey };
  }

  async function sendBatch(emails: ReadonlyArray<SendOptions>): Promise<ReadonlyArray<SendResult>> {
    // Resend's batch API is per-batch idempotent, but we still want
    // per-message idempotency keys so retries don't double-send.
    return Promise.all(emails.map((e) => send(e)));
  }

  return { send, sendBatch };
}
