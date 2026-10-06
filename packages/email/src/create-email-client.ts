/**
 * Build the agent's email client. The only place the agent touches
 * Resend. Adds the project's header conventions (`Precedence: bulk`
 * + `X-Digest-Id` for operator debugging) and a content-derived
 * idempotency key. v1 does not ship `List-Unsubscribe` headers —
 * the digest goes to a single configured recipient.
 */
import { Resend } from "resend";
import type { CreateEmailOptions, EmailClient, SendOptions, SendResult } from "./types.ts";
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
    const idemKey = deps.idempotencyKey ?? deriveIdempotencyKey(args);

    const headers: Record<string, string> = { Precedence: "bulk" };
    if (args.digestId !== undefined) headers["X-Digest-Id"] = args.digestId;

    const { data, error } = await resend.emails.send(
      {
        from,
        to: Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        html: args.html,
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

  return { send };
}
