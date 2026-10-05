/**
 * Zod schema for a Code Scanning alert.
 *
 * Reference: <https://docs.github.com/en/rest/code-scanning/code-scanning#list-code-scanning-alerts-for-an-organization>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";

/**
 * Severity union for Code Scanning alerts. Hoisted into a named schema
 * (rather than the previous `NonNullable<…["severity"]>` derivation)
 * so callers — including `../api/security.ts` — can derive the matching
 * TypeScript union without `undefined` leaking in via `.optional()`.
 */
export const CodeScanningSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
/** Inferred TypeScript union of {@link CodeScanningSeveritySchema}. */
export type CodeScanningSeverity = z.infer<typeof CodeScanningSeveritySchema>;

const AlertLocationSchema = z
  .object({
    path: z.string().max(4096),
    start_line: z.number().int().optional(),
    end_line: z.number().int().optional(),
    start_column: z.number().int().optional(),
    end_column: z.number().int().optional(),
  })
  .passthrough();

const AlertRuleSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    severity: CodeScanningSeveritySchema.nullable().optional(),
  })
  .passthrough();

const AlertToolSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().nullable().optional(),
  })
  .passthrough();

const VersionedMessageSchema = z
  .object({
    text: z.string().optional(),
  })
  .passthrough();

const AlertInstanceSchema = z
  .object({
    location: AlertLocationSchema.optional(),
    message: VersionedMessageSchema.optional(),
  })
  .passthrough();

export const CodeScanningAlertSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(["open", "fixed", "dismissed", "auto_dismissed", "deleted"]),
    severity: CodeScanningSeveritySchema.nullable().optional(),
    rule_id: z.string().nullable().optional(),
    rule: AlertRuleSchema.optional(),
    tool: AlertToolSchema.optional(),
    most_recent_instance: AlertInstanceSchema.optional(),
    html_url: GitHubHtmlUrlSchema,
    created_at: IsoDateTimeSchema,
    dismissed_at: NullableIsoDateTimeSchema.optional(),
    fixed_at: NullableIsoDateTimeSchema.optional(),
  })
  .passthrough();

export type CodeScanningAlert = z.infer<typeof CodeScanningAlertSchema>;
