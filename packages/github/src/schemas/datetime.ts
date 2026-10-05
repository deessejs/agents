/**
 * Shared ISO datetime schema for every `*_at` field on a GitHub API response.
 *
 * GitHub always emits RFC 3339 timestamps like `"2026-10-04T10:00:00Z"`.
 * Uses Zod 4's top-level `z.iso.datetime()` so we don't need to chain
 * `z.string().datetime()`.
 */
import { z } from "zod";

/** Required ISO datetime (every `created_at`, `updated_at`, etc.). */
export const IsoDateTimeSchema = z.iso.datetime();

/** Optional / nullable variant for `closed_at`, `merged_at`, `*_at` fields. */
export const NullableIsoDateTimeSchema = z.iso.datetime().nullable();
