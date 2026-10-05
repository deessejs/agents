/**
 * Value-pattern redaction. Pino cannot redact by value via its `redact` option,
 * so we install a custom `formatters.log` hook that walks every log object
 * and replaces any string that matches one of these patterns.
 *
 * Patterns run on every log object recursively — keep them simple and anchored
 * to avoid catastrophic backtracking.
 */

export const REDACTED = "[REDACTED]";

export interface ValuePattern {
  /** Short identifier for the secret kind, used in debug logs / docs. */
  name: string;
  /** Regex with the global flag set. Will be applied to every string value. */
  re: RegExp;
}

/**
 * Built-in value patterns. Anything matching one of these will be replaced
 * with `REDACTED` regardless of which field it appears in.
 */
export const DEFAULT_VALUE_PATTERNS: ValuePattern[] = [
  { name: "resend_api_key", re: /\bre_[a-zA-Z0-9]{20,}/g },
  // Non-capturing alternation so the whole token — including its identifier
  // prefix — is replaced with REDACTED.
  { name: "github_pat", re: /(?:ghp_|github_pat_|ghu_|gho_|ghs_|ghr_)[a-zA-Z0-9]+/g },
  // Capture the "Bearer " prefix so the redacted value still reads as a
  // bearer auth header.
  { name: "bearer", re: /(Bearer\s+)[a-zA-Z0-9\-._~+/=]+/g },
  // JWT — three base64url segments separated by dots. Anchored loosely so
  // partial matches inside larger strings still trigger redaction.
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: "email_pii", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
];

/**
 * Type predicate: is `value` a plain object (not `null`, not an array)?
 *
 * Used by {@link walk} to recurse safely without runtime casts.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Recursively walk `input`, replacing any string value that matches one of
 * `patterns` with {@link REDACTED}. Plain objects, arrays, and primitives are
 * all supported. Cycles are not possible here because we only mutate on the
 * way down (creating new containers).
 *
 * Patterns may include capture groups (e.g. to preserve a `"Bearer "` prefix);
 * the captured text is restored verbatim and only the rest is replaced with
 * {@link REDACTED}.
 */
export function walk(input: unknown, patterns: ValuePattern[] = DEFAULT_VALUE_PATTERNS): unknown {
  if (typeof input === "string") {
    let out = input;
    for (const { re } of patterns) {
      // Re-create the regex state per call — a global regex with `lastIndex`
      // mutated by `replace` would otherwise leak across runs.
      const pattern = new RegExp(re.source, re.flags);
      out = out.replace(pattern, (...matchArgs: unknown[]) => {
        // matchArgs is [match, ...captureGroups, offset, string, groups?]
        const captures = matchArgs.slice(1, -2) as string[];
        // Restore captured text (often a prefix) and append REDACTED for the
        // remaining matched text. If no captures, replaces the whole match.
        const prefix = captures.filter((c) => typeof c === "string").join("");
        return `${prefix}${REDACTED}`;
      });
    }
    return out;
  }
  if (Array.isArray(input)) {
    return input.map((value) => walk(value, patterns));
  }
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = walk(value, patterns);
    }
    return out;
  }
  return input;
}
