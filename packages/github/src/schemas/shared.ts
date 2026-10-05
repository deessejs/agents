/**
 * Shared schema fragments reused across the GitHub schemas package.
 *
 * Keep this file small and dependency-free — anything that imports a
 * single primitive should be inlinable into any other schema file
 * without pulling in a graph of related modules.
 */
import { z } from "zod";

/**
 * A 40-character lowercase hex Git commit SHA.
 *
 * The regex is anchored and limited to `[0-9a-f]{40}` so it catches
 * accidental non-hex content (e.g. uppercase hex from a stale cache,
 * truncated SHAs, or non-SHA values that happen to be 40 chars long).
 *
 * Reference: <https://git-scm.com/book/en/v2/Git-Internals-Git-Objects>.
 */
export const CommitShaSchema = z.string().regex(/^[0-9a-f]{40}$/, "must be a 40-char hex SHA");
