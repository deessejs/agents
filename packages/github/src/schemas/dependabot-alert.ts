/**
 * Zod schema for a Dependabot security alert.
 *
 * Reference: <https://docs.github.com/en/rest/dependabot/alerts#list-dependabot-alerts-for-an-organization>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";

/**
 * Package ecosystems Dependabot documents. The full set is stable enough
 * to enumerate — new ecosystems arrive rarely and we want a strict shape
 * so a malformed value surfaces immediately.
 *
 * Refs: <https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts#supported-ecosystems-and-package-managers>
 */
export const DependabotEcosystemSchema = z.enum([
  "composer",
  "cargo",
  "elm",
  "github_actions",
  "go",
  "maven",
  "npm",
  "nuget",
  "pip",
  "pub",
  "rubygems",
  "swift",
  "terraform",
  "gitsubmodule",
  "dotnet",
  "dart",
  "docker",
]);

export const DependabotAlertSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(["auto_dismissed", "dismissed", "fixed", "open", "resolved"]),
    severity: z.enum(["low", "medium", "high", "critical"]).nullable(),
    ecosystem: DependabotEcosystemSchema,
    package: z.object({
      name: z.string().min(1).max(214),
      ecosystem: DependabotEcosystemSchema.optional(),
      vulnerable_version_range: z.string().max(256).optional(),
    }),
    vulnerable_version_range: z.string().max(256),
    patched_version: z.string().max(64).nullable(),
    html_url: GitHubHtmlUrlSchema,
    created_at: IsoDateTimeSchema,
    dismissed_at: NullableIsoDateTimeSchema,
    fixed_at: NullableIsoDateTimeSchema,
  })
  .passthrough();

export type DependabotAlert = z.infer<typeof DependabotAlertSchema>;
export type DependabotEcosystem = z.infer<typeof DependabotEcosystemSchema>;
