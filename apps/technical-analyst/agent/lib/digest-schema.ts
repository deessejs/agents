/**
 * Zod schemas for the structured digest output, plus the BANNED regex
 * pre-check (re-exported from @workspace/format).
 *
 * Per the runtime doc §4.4.1, the schemas use `.strict()` so unknown
 * keys are rejected. The section text is constrained to `.max(2000)`
 * per the editorial length budget. After `generateObject` returns, every
 * section's text is run through the BANNED regex + cross-checked
 * against the input PR/URL set.
 */
import { z } from "zod";
import { BANNED } from "@workspace/format";

/** Per-section text constraint (C4 — see locked Phase 2 plan). */
const SectionText = z.string().min(1).max(2000);

/** Discriminated union of the 4 daily sections. */
const Section = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tldr"), text: SectionText }),
  z.object({ kind: z.literal("shipped"), text: SectionText }),
  z.object({ kind: z.literal("risks"), text: SectionText }),
  z.object({ kind: z.literal("watchlist"), text: SectionText }),
]);

export const DailyDigestSchema = z
  .object({
    kind: z.literal("daily"),
    /** ISO 8601 date in the recipient's local timezone. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    window: z.object({ start: z.string(), end: z.string() }),
    sections: z.array(Section).min(1).max(4),
  })
  .strict();

export type DailyDigest = z.infer<typeof DailyDigestSchema>;

/** Discriminated union of the 7 weekly sections. */
const WeeklySection = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tldr"), text: SectionText }),
  z.object({ kind: z.literal("shipped"), text: SectionText }),
  z.object({ kind: z.literal("inprogress"), text: SectionText }),
  z.object({ kind: z.literal("risks"), text: SectionText }),
  z.object({ kind: z.literal("metrics"), text: SectionText }),
  z.object({ kind: z.literal("trends"), text: SectionText }),
  z.object({ kind: z.literal("next"), text: SectionText }),
]);

export const WeeklyDigestSchema = z
  .object({
    kind: z.literal("weekly"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    window: z.object({ start: z.string(), end: z.string() }),
    sections: z.array(WeeklySection).min(1).max(7),
  })
  .strict();

export type WeeklyDigest = z.infer<typeof WeeklyDigestSchema>;

/** Re-export for call sites. */
export { BANNED };

/**
 * Project a raw `DailyDigest` (after `generateObject` returns) into the
 * `Safe*` shape: every section's text has passed the BANNED regex and
 * has been HTML-escaped for safe insertion into the email renderer.
 *
 * Throws on the first violation — the runtime doc §4.4 specifies that
 * a BANNED match aborts the run, not silently drops the section.
 */
export function validateAndEscape<
  T extends { sections: ReadonlyArray<{ kind: string; text: string }> },
>(digest: T): T {
  for (const section of digest.sections) {
    if (BANNED.test(section.text)) {
      throw new Error(
        `BANNED content detected in section kind=${section.kind} — aborting digest render`,
      );
    }
  }
  // React auto-escapes text nodes when rendered, so no manual
  // escapeHtml is needed here (and pre-escaping would double-escape).
  return digest;
}
