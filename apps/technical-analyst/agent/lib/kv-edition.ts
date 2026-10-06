/**
 * Cross-session edition + delivery-state persistence via Vercel KV.
 *
 * The agent runs each cron tick as a fresh Eve session, so session
 * state does not survive across runs. We persist the edition's
 * finalized payload + idempotency key here so a retry after a
 * partial failure (provider accepted, app failed before marking
 * delivered) reuses the same payload + key.
 *
 * Keys:
 *   `digest:${editionId}`  → EditionKVRecord (created on first send
 *                             attempt, updated on Resend success).
 *
 * The key includes the full edition identity (org + repo + kind +
 * period + recipient) so two concurrent runs (e.g. a manual retry
 * overlapping a schedule) never collide.
 */
import { kv } from "@vercel/kv";

export type EditionStatus = "pending" | "delivered";

export interface EditionKVRecord {
  readonly editionId: string;
  readonly org: string;
  readonly repo: string;
  readonly kind: "daily" | "weekly";
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly recipient: string;
  readonly subject: string;
  /** Rendered HTML — reused on retry. */
  readonly html: string;
  /** Plain-text fallback. */
  readonly text: string;
  /** Resend idempotency key derived from content. */
  readonly idempotencyKey: string;
  /** Provider message id once Resend accepts the send. */
  readonly messageId: string | null;
  readonly status: EditionStatus;
  readonly firstAttemptAt: string;
  readonly deliveredAt: string | null;
}

function key(editionId: string): string {
  return `digest:${editionId}`;
}

/** Read an existing edition record (returns null if absent). */
export async function readEdition(editionId: string): Promise<EditionKVRecord | null> {
  const v = await kv.get<EditionKVRecord>(key(editionId));
  return v;
}

/**
 * Create the pending record BEFORE sending. If the record already
 * exists in `pending` state, the caller reuses its payload + key
 * (do NOT regenerate). If it already exists in `delivered` state,
 * the caller short-circuits.
 */
export async function writePending(record: EditionKVRecord): Promise<void> {
  if (record.status !== "pending") {
    throw new Error("writePending requires status='pending'");
  }
  await kv.set(key(record.editionId), record, {
    // Keep the record around long enough for any realistic retry
    // (Resend retains idempotency keys for 24h by default).
    ex: 60 * 60 * 48,
  });
}

/** Update the record once Resend returns a message id. */
export async function markDelivered(editionId: string, messageId: string): Promise<void> {
  const current = await readEdition(editionId);
  if (current === null) {
    throw new Error(`markDelivered: no edition record for ${editionId}`);
  }
  const updated: EditionKVRecord = {
    ...current,
    status: "delivered",
    messageId,
    deliveredAt: new Date().toISOString(),
  };
  await kv.set(key(editionId), updated, { ex: 60 * 60 * 48 });
}
