/**
 * Zod schema for a Code Scanning alert.
 *
 * Reference: <https://docs.github.com/en/rest/code-scanning/code-scanning#list-code-scanning-alerts-for-an-organization>.
 */
import { z } from "zod";

const AlertLocationSchema = z
  .object({
    path: z.string(),
    start_line: z.number().int().optional(),
    end_line: z.number().int().optional(),
    start_column: z.number().int().optional(),
    end_column: z.number().int().optional(),
  })
  .strict();

const AlertRuleSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).nullable().optional(),
  })
  .strict();

const AlertToolSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().nullable().optional(),
  })
  .strict();

const VersionedMessageSchema = z
  .object({
    text: z.string().optional(),
  })
  .strict();

const AlertInstanceSchema = z
  .object({
    location: AlertLocationSchema.optional(),
    message: VersionedMessageSchema.optional(),
  })
  .strict();

export const CodeScanningAlertSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(["open", "fixed", "dismissed", "auto_dismissed", "deleted"]),
    severity: z.enum(["low", "medium", "high", "critical"]).nullable().optional(),
    rule_id: z.string().nullable().optional(),
    rule: AlertRuleSchema.optional(),
    tool: AlertToolSchema.optional(),
    most_recent_instance: AlertInstanceSchema.optional(),
    html_url: z.string(),
    created_at: z.string(),
    dismissed_at: z.string().nullable().optional(),
    fixed_at: z.string().nullable().optional(),
  })
  .strict();

export type CodeScanningAlert = z.infer<typeof CodeScanningAlertSchema>;
