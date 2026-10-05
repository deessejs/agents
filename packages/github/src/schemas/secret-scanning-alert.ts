/**
 * Zod schema for a Secret Scanning alert.
 *
 * Reference: <https://docs.github.com/en/rest/secret-scanning/secret-scanning#list-secret-scanning-alerts-for-an-organization>.
 */
import { z } from "zod";

const SecretLocationSchema = z
  .object({
    path: z.string().optional(),
    start_line: z.number().int().optional(),
    end_line: z.number().int().optional(),
    start_column: z.number().int().optional(),
    end_column: z.number().int().optional(),
  })
  .strict();

const SecretInstanceSchema = z
  .object({
    location: SecretLocationSchema.optional(),
  })
  .strict();

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
    secret_type: z.string(),
    secret_type_display_name: z.string(),
    resolution: z.string().nullable(),
    most_recent_instance: SecretInstanceSchema.optional(),
    html_url: z.string(),
    created_at: z.string(),
    resolved_at: z.string().nullable().optional(),
  })
  .strict();

export type SecretScanningAlert = z.infer<typeof SecretScanningAlertSchema>;
