/**
 * Build the header set that every email goes out with.
 *
 * Conventions enforced here:
 *   - `List-Unsubscribe: <https endpoint>, <mailto:>` — RFC 8058 one-click
 *   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click` — RFC 8058
 *   - `Precedence: bulk` — tells mail clients this is bulk mail
 *   - `X-Digest-Id: <digestId>` — operator-friendly debug header
 *
 * Callers (templates, agents) NEVER set these directly. Centralising
 * the convention in one place keeps the agent's brand + compliance
 * posture consistent.
 */
import type { CreateEmailOptions } from "./types.ts";

export interface BuildHeadersInput extends CreateEmailOptions {
  /** Optional per-message digest id (overrides CreateEmailOptions for one email). */
  readonly digestId?: string;
}

export function buildHeaders(input: BuildHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {
    Precedence: "bulk",
  };

  if (input.digestId !== undefined) {
    // Per-message override takes precedence over the factory-level id.
    headers["X-Digest-Id"] = input.digestId;
  }

  // RFC 8058 requires TWO list-unsubscribe endpoints (HTTPS + mailto).
  // The HTTPS endpoint embeds the digest id; the mailto is a static
  // catch-all that goes to the operator's monitored inbox.
  const httpsEndpoint =
    input.digestId !== undefined
      ? `${input.unsubscribeBaseUrl}/unsubscribe/${input.digestId}`
      : `${input.unsubscribeBaseUrl}/unsubscribe`;
  headers["List-Unsubscribe"] = `<${httpsEndpoint}>, <mailto:${input.unsubscribeMailto}>`;
  headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";

  return headers;
}
