/**
 * Public type surface for the email wrapper.
 *
 * `CreateEmailOptions` is the factory input. `SendOptions` is the
 * per-message argument. `SendResult` is what the wrapper returns.
 */

export interface CreateEmailOptions {
  readonly apiKey: string;
  readonly from: { readonly name: string; readonly address: string };
  readonly replyTo?: string;
}

export interface SendTag {
  readonly name: string;
  readonly value: string;
}

export interface SendOptions {
  readonly to: string | ReadonlyArray<string>;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
  readonly tags?: ReadonlyArray<SendTag>;
  readonly digestId?: string;
}

export interface SendResult {
  readonly id: string;
  readonly idempotencyKey: string;
}

export interface EmailClient {
  send(options: SendOptions, deps?: { idempotencyKey?: string }): Promise<SendResult>;
}
