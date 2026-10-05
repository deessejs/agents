/**
 * Zod schema for a Secret Scanning alert.
 *
 * Reference: <https://docs.github.com/en/rest/secret-scanning/secret-scanning#list-secret-scanning-alerts-for-an-organization>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";

const SecretLocationSchema = z
  .object({
    path: z.string().optional(),
    start_line: z.number().int().optional(),
    end_line: z.number().int().optional(),
    start_column: z.number().int().optional(),
    end_column: z.number().int().optional(),
  })
  .passthrough();

const SecretInstanceSchema = z
  .object({
    location: SecretLocationSchema.optional(),
  })
  .passthrough();

/**
 * Allowed resolution values per the GitHub docs. The set is small enough
 * to keep as an enum.
 */
const SecretResolutionSchema = z
  .enum([
    "false_positive",
    "wont_fix",
    "revoked",
    "used_in_tests",
    "pattern_edited",
    "pattern_deleted",
  ])
  .nullable();

export const SecretScanningAlertSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum([
      "open",
      "resolved",
      "invalid",
      "false_positive",
      "used_in_tests",
      "pattern_edited",
      "pattern_deleted",
    ]),
    secret_type: z.string().regex(/^[a-z_]+$/, "secret_type must be snake_case lowercase"),
    secret_type_display_name: z.string().min(1).max(100),
    resolution: SecretResolutionSchema,
    most_recent_instance: SecretInstanceSchema.optional(),
    html_url: GitHubHtmlUrlSchema,
    created_at: IsoDateTimeSchema,
    resolved_at: NullableIsoDateTimeSchema.optional(),
  })
  .passthrough();

export type SecretScanningAlert = z.infer<typeof SecretScanningAlertSchema>;
