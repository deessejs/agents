/**
 * `submit_digest` — validate the model's report, render it with the
 * React-Email components in `@workspace/email/renderDigest`, and
 * deliver it to the configured recipient via Resend.
 *
 * Stable edition identity + retry semantics:
 *
 *   1. Read the edition state from session (`edition.update` ran in
 *      `collect_activity`). If absent, throw — the agent must call
 *      `collect_activity` first.
 *
 *   2. Read the persistent KV record for this edition. If
 *      `status === "delivered"`, return the existing messageId.
 *
 *   3. Otherwise validate the report, resolve references, render.
 *      The Resend idempotency key is derived from `(subject, html,
 *      text, to)` so the same payload always produces the same key.
 *
 *   4. Pre-write the KV record with `status: "pending"` BEFORE
 *      calling Resend. If the app fails after Resend accepted (the
 *      status-update step), the next attempt reuses the persisted
 *      payload + key — Resend deduplicates within its retention
 *      window. The render output is stable across retries because
 *      it is derived from the persisted corpus, not regenerated.
 *
 *   5. Call Resend.send. On 2xx → `markDelivered`. On throw →
 *      propagate; the schedule sees an unsuccessful run.
 *
 * `preview: true` writes the rendered HTML to disk and skips both
 * the send and the KV record. The KV record is NOT written.
 *
 * `pause` is checked in `collect_activity` (before any model work
 * runs); the tool also re-checks defensively.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { defineTool } from "eve/tools";
import { z } from "zod";

import { createEmailClient, renderDigest, deriveIdempotencyKey } from "@workspace/email";

import { env } from "../env.ts";
import { edition as editionState, sourceCorpus, type Source, type Edition } from "../lib/state.ts";
import {
  readEdition,
  writePending,
  markDelivered,
  type EditionKVRecord,
} from "../lib/kv-edition.ts";

// ── Zod for the model's report ─────────────────────────────────────────

/**
 * Compact item shape: an annotated bullet the renderer combines with
 * the resolved corpus entries. The model supplies the annotation; the
 * URL + title come from the corpus. The annotated text is plain
 * prose — we don't try to enforce lexical safety (the corpus-derived
 * URLs go through React's JSX escape, which is the only safety the
 * digest relies on).
 */
const ItemSchema = z.object({
  /** Annotation from the model. */
  text: z.string().min(1).max(500),
  /** Required reference into the corpus. Must resolve. */
  referenceId: z.string().min(1),
});

const DailySectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tldr"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("shipped"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("risks"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("watchlist"), items: z.array(ItemSchema).min(1).max(8) }),
]);

const WeeklySectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tldr"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("shipped"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("inprogress"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("risks"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("metrics"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("trends"), items: z.array(ItemSchema).min(1).max(8) }),
  z.object({ kind: z.literal("next"), items: z.array(ItemSchema).min(1).max(8) }),
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

const DAILY_REF_KINDS: Record<string, ReadonlyArray<Source["kind"]>> = {
  tldr: ["merged_pr", "release", "opened_issue", "closed_issue"],
  shipped: ["merged_pr", "release"],
  risks: [
    "dependabot_alert",
    "code_scanning_alert",
    "secret_scanning_alert",
    "failed_workflow_run",
    "open_pr",
  ],
  watchlist: ["open_pr", "merged_pr", "opened_issue"],
};

const WEEKLY_REF_KINDS: Record<string, ReadonlyArray<Source["kind"]>> = {
  tldr: ["merged_pr", "release", "opened_issue", "closed_issue"],
  shipped: ["merged_pr", "release"],
  inprogress: ["open_pr"],
  risks: [
    "dependabot_alert",
    "code_scanning_alert",
    "secret_scanning_alert",
    "failed_workflow_run",
    "open_pr",
  ],
  metrics: ["merged_pr", "dependabot_alert", "code_scanning_alert"],
  trends: ["merged_pr", "release"],
  next: ["open_pr", "dependabot_alert"],
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

// ── Edition record construction ──────────────────────────────────────────

function digestSubjectFor(edition: Edition): string {
  if (edition.kind === "daily") {
    return `Daily digest — ${edition.period.label} [${shortId(edition.id)}]`;
  }
  return `Weekly recap — week of ${edition.period.label} [${shortId(edition.id)}]`;
}

function shortId(editionId: string): string {
  return createHash("sha256").update(editionId).digest("hex").slice(0, 8);
}

function editionKvRecord(
  ed: Edition,
  subject: string,
  html: string,
  text: string,
  idempotencyKey: string,
): EditionKVRecord {
  const [org, repo] = ed.repo.split("/");
  if (!org || !repo) throw new Error(`Invalid repo "${ed.repo}"`);
  return {
    editionId: ed.id,
    org,
    repo,
    kind: ed.kind,
    periodStart: ed.period.start,
    periodEnd: ed.period.end,
    recipient: ed.recipient,
    subject,
    html,
    text,
    idempotencyKey,
    messageId: null,
    status: "pending",
    firstAttemptAt: new Date().toISOString(),
    deliveredAt: null,
  };
}

// ── Tool definition ────────────────────────────────────────────────────

export default defineTool({
  description:
    "Validate a structured digest report against the collected source corpus, render it, " +
    "and deliver it to the configured recipient via Resend. Every item must reference a " +
    "corpus id; URLs come from the corpus (not the model). Pass preview=true to render " +
    "to disk without sending or mutating delivery state. Throws if env.AGENTS_PAUSED=true.",
  inputSchema: SubmitInputSchema,
  endsTurn: true,
  label: {
    start: ({ kind, preview }) =>
      preview ? `Preview ${kind} digest (no send)` : `Deliver ${kind} digest`,
  },
  async execute(rawInput: unknown) {
    // `defineTool` documents the schema to the model but does not
    // always enforce `.strict()` strictly (some provider adapters
    // strip unknown keys before they reach us). Validate again here
    // so unknown fields cannot reach the rest of the pipeline.
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
    const existing = await readEdition(ed.id);
    if (existing?.status === "delivered") {
      return {
        status: "already-delivered" as const,
        editionId: ed.id,
        messageId: existing.messageId,
      };
    }

    const corpus = sourceCorpus.get();
    if (corpus.sources.length === 0 && corpus.availability.length === 0) {
      throw new Error(
        "submit_digest: corpus is empty — call collect_activity first to populate sources.",
      );
    }
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
      const items = resolveSection(section, corpus.sources, allowed);
      resolvedSections.push({ kind: section.kind, items });
    }

    const subject = digestSubjectFor(ed);
    const header = `Org: ${ed.repo} · Data as of ${ed.period.label} UTC · Edition: ${shortId(ed.id)}`;
    const footer = `Generated by the Technical Analyst. List-Unsubscribe: <${env.UNSUBSCRIBE_BASE_URL}/unsubscribe/${shortId(ed.id)}>, <mailto:${env.UNSUBSCRIBE_MAILTO}>.`;

    const rendered = await renderDigest({
      kind,
      subject,
      header,
      footer,
      sections: resolvedSections.map((s) => ({
        kind: s.kind,
        text: "",
        references: s.items.map((i) => ({
          id: i.source.id,
          url: i.source.url,
          title: `${i.text} → ${i.source.title}`,
        })),
      })),
    });

    const { html, text } = rendered;

    if (preview) {
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

    // Pre-write the outgoing payload BEFORE sending so a retry
    // reuses it (Resend deduplicates identical requests within
    // its 24h retention window).
    await writePending(editionKvRecord(ed, subject, html, text, idempotencyKey));

    const email = createEmailClient({
      apiKey: env.RESEND_API_KEY,
      from: { name: env.RESEND_FROM_NAME, address: env.RESEND_FROM_ADDRESS },
      ...(env.RESEND_REPLY_TO !== undefined ? { replyTo: env.RESEND_REPLY_TO } : {}),
      unsubscribeBaseUrl: env.UNSUBSCRIBE_BASE_URL,
      unsubscribeMailto: env.UNSUBSCRIBE_MAILTO,
    });

    const result = await email.send({
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
    });

    await markDelivered(ed.id, result.id);

    return {
      status: "delivered" as const,
      editionId: ed.id,
      messageId: result.id,
      idempotencyKey,
    };
  },
});
