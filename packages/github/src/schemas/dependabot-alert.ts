/**
 * Zod schema for a Dependabot security alert.
 *
 * Reference: <https://docs.github.com/en/rest/dependabot/alerts#list-dependabot-alerts-for-an-organization>.
 */
import { z } from "zod";

export const DependabotAlertSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(["auto_dismissed", "dismissed", "fixed", "open", "resolved"]),
    severity: z.enum(["low", "medium", "high", "critical"]).nullable(),
    ecosystem: z.string(),
    package: z.object({
      name: z.string(),
      ecosystem: z.string().optional(),
      vulnerable_version_range: z.string().optional(),
    }),
    vulnerable_version_range: z.string(),
    patched_version: z.string().nullable(),
    html_url: z.string(),
    created_at: z.string(),
    dismissed_at: z.string().nullable(),
    fixed_at: z.string().nullable(),
  })
  .strict();

export type DependabotAlert = z.infer<typeof DependabotAlertSchema>;
