/**
 * Zod schema for a Dependabot security alert.
 *
 * Reference: <https://docs.github.com/en/rest/dependabot/alerts#list-dependabot-alerts-for-an-organization>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";

export const DependabotAlertSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(["auto_dismissed", "dismissed", "fixed", "open", "resolved"]),
    severity: z.enum(["low", "medium", "high", "critical"]).nullable(),
    ecosystem: z.string(),
    package: z.object({
      name: z.string().min(1).max(214),
      ecosystem: z.string().optional(),
      vulnerable_version_range: z.string().optional(),
    }),
    vulnerable_version_range: z.string(),
    patched_version: z.string().nullable(),
    html_url: GitHubHtmlUrlSchema,
    created_at: IsoDateTimeSchema,
    dismissed_at: NullableIsoDateTimeSchema,
    fixed_at: NullableIsoDateTimeSchema,
  })
  .passthrough();

export type DependabotAlert = z.infer<typeof DependabotAlertSchema>;
