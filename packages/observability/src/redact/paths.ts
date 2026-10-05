/**
 * Path-based redaction list for pino's built-in `redact` option.
 *
 * Pino redaction works on **fixed key paths only** — it cannot inspect values.
 * This list covers the common locations secrets appear in (request/response
 * headers at any depth, well-known env var names, password-style fields).
 *
 * Custom secrets that don't match a path should be added via
 * {@link DEFAULT_VALUE_PATTERNS} in `./values.ts` instead.
 */
export const DEFAULT_REDACT_PATHS: string[] = [
  // Authorization-style headers, any depth
  "*.authorization",
  "*.Authorization",
  "*.x-api-key",
  "*.X-Api-Key",
  "*.cookie",
  "*.Cookie",
  "*.set-cookie",
  "*.Set-Cookie",

  // Pino-reserved paths
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "res.headers.set-cookie",
];
