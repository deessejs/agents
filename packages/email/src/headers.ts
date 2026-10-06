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

/**
 * Reject any string that contains a CR or LF. Defense-in-depth
 * against header injection: today every value that reaches
 * `buildHeaders` is either env-validated (`UNSUBSCRIBE_BASE_URL`
 * is `z.url()`), env-typed (`digestId` is sha256-hex, 8 chars),
 * or env-supplied (`unsubscribeMailto` is `z.email()`). A future
 * caller (test, plugin, env override) could not inject `\r\n`
 * without this guard.
 */
function assertNoCrlf(name: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(
      `buildHeaders: ${name} contains CR/LF — refusing to inject header`,
    );
  }
}

export function buildHeaders(input: BuildHeadersInput): Record<string, string> {
  // I6 fix: reject CRLF in any field that flows into a header value.
  // Today every input is env-validated; this is defense-in-depth
  // for future callers (tests, plugins) that pass raw strings.
  assertNoCrlf("digestId", input.digestId ?? "");
  assertNoCrlf("unsubscribeBaseUrl", input.unsubscribeBaseUrl);
  assertNoCrlf("unsubscribeMailto", input.unsubscribeMailto);

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
