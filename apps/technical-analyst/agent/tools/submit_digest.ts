/**
 * `submit_digest` — validate the model's report against the corpus,
 * render it (HTML + plain text) via `@workspace/email/renderDigest`,
 * and deliver it via Resend.
 *
 * No cross-session persistence: v1 does not require exactly-once
 * delivery. Retries of the same outgoing payload reuse Resend's
 * content-derived idempotency key (24h window); independently regen
 * runs may occasionally send a duplicate — acceptable for an internal
 * daily/weekly recap.
 *
 * `preview: true` always renders + writes to disk, regardless of
 * whether the edition was previously sent. Preview does not mutate
 * delivery state.
 *
 * `pause` is checked in `collect_activity` (before any model work);
 * the tool also re-checks defensively at execute entry.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { defineTool } from "eve/tools";
import { z } from "zod";

import { createEmailClient, renderDigest, deriveIdempotencyKey } from "@workspace/email";

import { env } from "../env.ts";
import { edition as editionState, sourceCorpus, type Source, type Edition } from "../lib/state.ts";

// ── Zod for the model's report ─────────────────────────────────────────
//
// `metrics` (weekly) accepts 0 items so a calm week still produces
// a recap. Other sections accept 0..8; the renderer skips them silently
// when empty.

const ItemSchema = z.object({
  text: z.string().min(1).max(500),
  referenceId: z.string().min(1),
});

const sectionShape = {
  tldr: z.array(ItemSchema).min(0).max(8),
  shipped: z.array(ItemSchema).min(0).max(8),
  risks: z.array(ItemSchema).min(0).max(8),
  watchlist: z.array(ItemSchema).min(0).max(8),
  inprogress: z.array(ItemSchema).min(0).max(8),
  metrics: z.array(ItemSchema).min(0).max(8),
  trends: z.array(ItemSchema).min(0).max(8),
  next: z.array(ItemSchema).min(0).max(8),
};

const DailySectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tldr"), items: sectionShape.tldr }),
  z.object({ kind: z.literal("shipped"), items: sectionShape.shipped }),
  z.object({ kind: z.literal("risks"), items: sectionShape.risks }),
  z.object({ kind: z.literal("watchlist"), items: sectionShape.watchlist }),
]);

const WeeklySectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tldr"), items: sectionShape.tldr }),
  z.object({ kind: z.literal("shipped"), items: sectionShape.shipped }),
  z.object({ kind: z.literal("inprogress"), items: sectionShape.inprogress }),
  z.object({ kind: z.literal("risks"), items: sectionShape.risks }),
  z.object({ kind: z.literal("metrics"), items: sectionShape.metrics }),
  z.object({ kind: z.literal("trends"), items: sectionShape.trends }),
  z.object({ kind: z.literal("next"), items: sectionShape.next }),
]);

const DailyReportSchema = z
  .object({
    kind: z.literal("daily"),
    sections: z.array(DailySectionSchema).min(1).max(4),
  })
  .strict();

const WeeklyReportSchema = z
  .object({
    kind: z.literal("weekly"),
    sections: z.array(WeeklySectionSchema).min(1).max(7),
  })
  .strict();

const SubmitInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("daily"),
      report: DailyReportSchema,
      preview: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal("weekly"),
      report: WeeklyReportSchema,
      preview: z.boolean().default(false),
    })
    .strict(),
]);

// ── Reference-kind allowlist per section ───────────────────────────────
//
// Each allowlist is editorial, not gating: the renderer surfaces
// whatever section the model puts each kind in. The allowlists below
// reflect what a reasonable editor would put in each section
// (e.g. a release is fine on the watchlist as an upcoming note;
// a failed workflow run is a legitimate top-of-email signal). A
// section refusing a kind that's editorially reasonable just makes
// the model retry until it picks a less informative pair — which is
// exactly the launch-blocking failure mode we saw in production.

const DAILY_REF_KINDS: Record<string, ReadonlyArray<Source["kind"]>> = {
  tldr: [
    "merged_pr",
    "release",
    "opened_issue",
    "closed_issue",
    "failed_workflow_run",
    "dependabot_alert",
    "code_scanning_alert",
    "secret_scanning_alert",
  ],
  shipped: ["merged_pr", "release", "closed_issue"],
  risks: [
    "dependabot_alert",
    "code_scanning_alert",
    "secret_scanning_alert",
    "failed_workflow_run",
    "open_pr",
    "opened_issue",
    "release",
  ],
  watchlist: ["open_pr", "merged_pr", "opened_issue", "release", "failed_workflow_run"],
};

const WEEKLY_REF_KINDS: Record<string, ReadonlyArray<Source["kind"]>> = {
  tldr: ["merged_pr", "release", "opened_issue", "closed_issue", "failed_workflow_run"],
  shipped: ["merged_pr", "release", "closed_issue"],
  inprogress: ["open_pr", "merged_pr"],
  risks: [
    "dependabot_alert",
    "code_scanning_alert",
    "secret_scanning_alert",
    "failed_workflow_run",
    "open_pr",
    "opened_issue",
  ],
  metrics: ["merged_pr", "dependabot_alert", "code_scanning_alert", "release"],
  trends: ["merged_pr", "release", "failed_workflow_run"],
  next: ["open_pr", "dependabot_alert", "code_scanning_alert", "release", "failed_workflow_run"],
};

// ── Reference resolution ──────────────────────────────────────────────

interface ResolvedItem {
  readonly text: string;
  readonly source: Source;
}

function resolveSection(
  section: { kind: string; items: ReadonlyArray<{ text: string; referenceId: string }> },
  corpusSources: ReadonlyArray<Source>,
  refKindAllowed: ReadonlyArray<Source["kind"]>,
): ResolvedItem[] {
  const byId = new Map(corpusSources.map((s) => [s.id, s] as const));
  const out: ResolvedItem[] = [];
  for (const item of section.items) {
    const source = byId.get(item.referenceId);
    if (!source) {
      throw new Error(
        `submit_digest: reference id "${item.referenceId}" is not in the corpus. ` +
          `Every reference must come from collect_activity's output.`,
      );
    }
    if (!refKindAllowed.includes(source.kind)) {
      throw new Error(
        `submit_digest: section kind="${section.kind}" may not cite source ` +
          `kind="${source.kind}" (id=${item.referenceId}).`,
      );
    }
    out.push({ text: item.text, source });
  }
  return out;
}

// ── Edition formatting helpers ─────────────────────────────────────────

function digestSubjectFor(edition: Edition): string {
  if (edition.kind === "daily") {
    return `Daily digest — ${edition.period.label} [${shortId(edition.id)}]`;
  }
  return `Weekly recap — week of ${edition.period.label} [${shortId(edition.id)}]`;
}

function shortId(editionId: string): string {
  return createHash("sha256").update(editionId).digest("hex").slice(0, 8);
}

// ── Tool definition ────────────────────────────────────────────────────

export default defineTool({
  description:
    "Validate a structured digest report against the collected source corpus, render it as " +
    "HTML + plain text, and deliver it to the configured recipient via Resend. Every item " +
    "must reference a corpus id; URLs + titles come from the corpus (not the model). Pass " +
    "preview=true to render to disk without sending. Throws if env.AGENTS_PAUSED=true.",
  inputSchema: SubmitInputSchema,
  endsTurn: true,
  label: {
    start: ({ kind, preview }) =>
      preview ? `Preview ${kind} digest (no send)` : `Deliver ${kind} digest`,
  },
  async execute(rawInput: unknown) {
    const parsed = SubmitInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new Error(
        `submit_digest: invalid input: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    const { kind, report, preview } = parsed.data;

    if (process.env.AGENTS_PAUSED === "true") {
      throw new Error("Agent is paused (env.AGENTS_PAUSED=true). The delivery will not be sent.");
    }

    const ed = editionState.get();
    if (ed.id === "") {
      throw new Error("submit_digest: edition state is empty — call collect_activity first");
    }
    if (ed.kind !== kind) {
      throw new Error(
        `submit_digest: report kind="${kind}" does not match edition kind="${ed.kind}". ` +
          `Call collect_activity({ kind: "${kind}" }) before submitting.`,
      );
    }

    const corpus = sourceCorpus.get();
    // The corpus may be legitimately empty (calm period). availability
    // is the source-level list of failed optional fetches.
    const refMap = (kind === "daily" ? DAILY_REF_KINDS : WEEKLY_REF_KINDS) as Record<
      string,
      ReadonlyArray<Source["kind"]>
    >;

    interface ResolvedSection {
      kind: string;
      items: ResolvedItem[];
    }
    const resolvedSections: ResolvedSection[] = [];
    for (const section of report.sections) {
      const allowed = refMap[section.kind] ?? [];
      resolvedSections.push({
        kind: section.kind,
        items: resolveSection(section, corpus.sources, allowed),
      });
    }

    const subject = digestSubjectFor(ed);
    const header =
      `Repo: ${ed.repo} · Period: ${ed.period.start} → ${ed.period.end} UTC · ` +
      `Collected: ${ed.collectedAt} · Edition: ${shortId(ed.id)}`;
    const footer =
      `Generated by the Technical Analyst (${ed.kind}, ` +
      `${resolvedSections.reduce((n, s) => n + s.items.length, 0)} items).`;

    const rendered = await renderDigest({
      kind,
      subject,
      header,
      footer,
      edition: {
        repo: ed.repo,
        period: { start: ed.period.start, end: ed.period.end, label: ed.period.label },
        counts: corpus.counts as unknown as Record<string, number>,
        weeklyMetrics:
          corpus.weeklyMetrics === null
            ? null
            : (corpus.weeklyMetrics as unknown as Record<string, number>),
        availability: [...corpus.availability],
      },
      sections: resolvedSections.map((s) => ({
        kind: s.kind,
        items: s.items.map((i) => ({
          text: i.text,
          source: {
            id: i.source.id,
            kind: i.source.kind,
            url: i.source.url,
            title: i.source.title,
          },
        })),
      })),
    });

    const { html, text } = rendered;

    if (preview) {
      // Preview never mutates delivery state. It does not consult any
      // prior-send record. It always writes to disk and returns.
      const dir = "tmp";
      await mkdir(dir, { recursive: true });
      const path = join(dir, `preview-${kind}-${shortId(ed.id)}-${Date.now()}.html`);
      await writeFile(path, html, "utf8");
      return { status: "preview" as const, path, editionId: shortId(ed.id) };
    }

    const idempotencyKey = deriveIdempotencyKey({
      to: ed.recipient,
      subject,
      html,
      text,
    });

    const email = createEmailClient({
      apiKey: env.RESEND_API_KEY,
      from: { name: env.RESEND_FROM_NAME, address: env.RESEND_FROM_ADDRESS },
      ...(env.RESEND_REPLY_TO !== undefined ? { replyTo: env.RESEND_REPLY_TO } : {}),
    });

    const result = await email.send(
      {
        to: ed.recipient,
        subject,
        html,
        text,
        digestId: shortId(ed.id),
        tags: [
          { name: "agent", value: "technical-analyst" },
          { name: "kind", value: kind },
          { name: "edition", value: ed.id },
        ],
      },
      { idempotencyKey },
    );

    return {
      status: "delivered" as const,
      editionId: ed.id,
      messageId: result.id,
      idempotencyKey,
    };
  },
});
