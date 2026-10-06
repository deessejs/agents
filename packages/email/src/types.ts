/**
 * Public type surface for the email wrapper.
 *
 * `CreateEmailOptions` is the factory input. `SendOptions` is the
 * per-message argument. `SendResult` is what the wrapper returns. The
 * factory and methods are defined in {@link ./create-email-client.ts}.
 */

/**
 * Factory input. `from` and `replyTo` are env-derived (set once at boot);
 * `unsubscribeBaseUrl` + `unsubscribeMailto` are used by {@link
 * ./headers.ts} to build the RFC 8058 `List-Unsubscribe` header.
 */
export interface CreateEmailOptions {
  /** Resend API key (starts with `re_`). */
  readonly apiKey: string;
  /** Envelope sender. */
  readonly from: {
    readonly name: string;
    readonly address: string;
  };
  /** Optional `Reply-To:` address. */
  readonly replyTo?: string;
  /**
   * HTTPS URL prefix for the per-digest unsubscribe endpoint
   * (e.g. `https://app.deessejs.com`). The full URL is
   * `${unsubscribeBaseUrl}/unsubscribe/${digestId}`.
   */
  readonly unsubscribeBaseUrl: string;
  /**
   * `mailto:` address for the RFC 8058 dual endpoint
   * (e.g. `unsubscribe@mail.deessejs.com`).
   */
  readonly unsubscribeMailto: string;
}

/**
 * A `tag` is a Resend-specific (key, value) pair used for analytics
 * filtering in the Resend dashboard. We standardize on a literal-union
 * shape for the agent's tags; callers can pass `[]` for none.
 */
export interface SendTag {
  readonly name: string;
  readonly value: string;
}

/** Per-message input. The wrapper fills in headers and idempotencyKey. */
export interface SendOptions {
  /** Single address or list. */
  readonly to: string | ReadonlyArray<string>;
  readonly subject: string;
  /** Rendered HTML body (sanitized by the template layer). */
  readonly html: string;
  /** Optional plain-text fallback for clients that don't render HTML. */
  readonly text?: string;
  /** Tags for Resend analytics filtering. */
  readonly tags?: ReadonlyArray<SendTag>;
  /**
   * Per-message digest identifier. Embedded in the subject (caller's
   * job) AND the `X-Digest-Id` header (wrapper's job). Optional so the
   * wrapper can be used for non-digest emails.
   */
  readonly digestId?: string;
}

/** Successful-send result. */
export interface SendResult {
  /** Resend message id (opaque, used for webhook reconciliation). */
  readonly id: string;
  /** The idempotency key that was sent. */
  readonly idempotencyKey: string;
}

/** The factory's return shape. */
export interface EmailClient {
  /**
   * Send one email. Throws on Resend errors. The idempotency key is
   * derived from (subject, html, text, digestId) so retries don't
   * double-send.
   */
  send(options: SendOptions): Promise<SendResult>;
  /**
   * Send N emails. Resend's batch endpoint is used internally;
   * per-message idempotency keys are derived as in `send`.
   */
  sendBatch(options: ReadonlyArray<SendOptions>): Promise<ReadonlyArray<SendResult>>;
}
