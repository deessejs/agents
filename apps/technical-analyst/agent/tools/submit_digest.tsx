/**
 * `submit_digest` — validate a structured report against the corpus
 * the agent collected, render it with React Email, and deliver it to
 * the configured recipient via Resend.
 *
 * The report contract is intentionally compact: a digest edition
 * (`kind: "daily" | "weekly"`), a window, and an ordered list of
 * sections. Each section cites the `id`s of source records it
 * references; `submit_digest` rejects the call if any cited id is
 * not in the corpus.
 *
 * Authoritative identity:
 *   - `digestId` is derived from (org, kind, window start, window end).
 *   - The Resend idempotency key is derived from the rendered content.
 *     Retries with the same payload reuse the same key.
 *   - A successful send writes a delivery record into session state
 *     so the schedule's success-or-failure detector can confirm.
 *
 * `preview: true` renders the email to disk and skips Resend; the
 * delivery record is NOT written.
 *
 * `pause` is read from `env.AGENTS_PAUSED`; when true, the tool throws
 * and the schedule aborts with an info log.
 */
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { defineTool } from "eve/tools";
import { defineState } from "eve/context";
import { z } from "zod";
import { render } from "react-email";

import { createEmailClient, type SendResult } from "@workspace/email";
import { EmailShell, DigestBlock, type SectionKind } from "@workspace/email/templates";

import { env } from "../env.ts";
import { sourceCorpus, type SourceEntry } from "../lib/source-corpus.ts";

/**
 * Module-scope delivery record. Persists the LAST successful send so
 * a partial-failure retry (provider accepted, app failed before
 * marking delivered) can detect the state and reuse the payload + key.
 * State is scoped to the active eve session; every cron tick is a
 * fresh session, so the record is per-run by design.
 */
interface DeliveryRecord {
  readonly kind: "daily" | "weekly";
  readonly recipient: string;
  readonly digestId: string;
  readonly idempotencyKey: string;
  readonly messageId: string;
  readonly sentAt: string;
}

const deliveryLog = defineState<DeliveryRecord | null>(
  "technical-analyst.delivery-log",
  () => null,
);

/** Allowed reference kinds per daily section. The model picks from these. */
const DAILY_REF_KINDS: Record<SectionKind, ReadonlyArray<string>> = {
  tldr: ["merged_pr", "opened_issue", "closed_issue", "release"],
  shipped: ["merged_pr", "release"],
  risks: [
    "dependabot_alert",
    "code_scanning_alert",
    "secret_scanning_alert",
    "failed_workflow_run",
    "merged_pr",
  ],
  watchlist: ["merged_pr", "opened_issue"],
};

const WEEKLY_SECTIONS = [
  "tldr",
  "shipped",
  "inprogress",
  "risks",
  "metrics",
  "trends",
  "next",
] as const;
type WeeklySectionKind = (typeof WEEKLY_SECTIONS)[number];

const WEEKLY_REF_KINDS: Record<WeeklySectionKind, ReadonlyArray<string>> = {
  tldr: ["merged_pr", "release", "opened_issue", "closed_issue"],
  shipped: ["merged_pr", "release"],
  inprogress: ["merged_pr", "opened_issue"],
  risks: [
    "dependabot_alert",
    "code_scanning_alert",
    "secret_scanning_alert",
    "failed_workflow_run",
    "merged_pr",
  ],
  metrics: ["merged_pr", "failed_workflow_run", "dependabot_alert"],
  trends: ["merged_pr", "release"],
  next: ["merged_pr", "opened_issue", "dependabot_alert"],
};

/** Stable daily-section kind to RAG status. */
const STATUS_BY_SECTION: Record<SectionKind, "green" | "yellow" | "red"> = {
  tldr: "yellow",
  shipped: "green",
  risks: "red",
  watchlist: "yellow",
};

/** Zod for the model's report. Strict: unknown fields are rejected. */
const ReferenceSchema = z.object({
  id: z.string().regex(/^(pr|issue|dependabot|codeql|secret|run|release|openpr):/),
});

const DailySectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("tldr"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("shipped"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("risks"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("watchlist"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
]);

const WeeklySectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("tldr"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("shipped"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("inprogress"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("risks"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("metrics"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("trends"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("next"),
      text: z.string().min(1).max(2000),
      references: z.array(ReferenceSchema),
    })
    .strict(),
]);

const DailyReportSchema = z
  .object({
    kind: z.literal("daily"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    window: z.object({ start: z.string(), end: z.string() }),
    sections: z.array(DailySectionSchema).min(1).max(4),
  })
  .strict();

const WeeklyReportSchema = z
  .object({
    kind: z.literal("weekly"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    window: z.object({ start: z.string(), end: z.string() }),
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

/** Derive the digestId from the canonical window. */
function digestIdFor(org: string, kind: "daily" | "weekly", start: string, end: string): string {
  return createHash("sha256")
    .update([org, kind, start, end].join("|"))
    .digest("hex")
    .slice(0, 8);
}

/**
 * Resolve every reference the model put in the report. Returns the
 * resolved entries grouped per section, in report order. Throws on
 * the first unknown id or wrong-kind citation.
 */
function resolveReferences(
  report: {
    sections: ReadonlyArray<{
      kind: string;
      text: string;
      references: ReadonlyArray<{ id: string }>;
    }>;
  },
  corpus: ReadonlyArray<SourceEntry>,
  refKindAllowedByKind: Record<string, ReadonlyArray<string>>,
): Array<{ section: { kind: string; text: string }; refs: SourceEntry[] }> {
  const byId = new Map<string, SourceEntry>(corpus.map((s) => [s.id, s]));
  const out: Array<{ section: { kind: string; text: string }; refs: SourceEntry[] }> = [];
  for (const section of report.sections) {
    const allowed = refKindAllowedByKind[section.kind] ?? [];
    const refs: SourceEntry[] = [];
    for (const ref of section.references) {
      const entry = byId.get(ref.id);
      if (!entry) {
        throw new Error(
          `submit_digest: referenced id "${ref.id}" is not in the corpus. ` +
            `Every reference must come from collect_activity's output.`,
        );
      }
      if (!allowed.includes(entry.kind)) {
        throw new Error(
          `submit_digest: section kind="${section.kind}" may not cite source kind="${entry.kind}" (id=${ref.id}).`,
        );
      }
      refs.push(entry);
    }
    out.push({ section: { kind: section.kind, text: section.text }, refs });
  }
  return out;
}

/** Render the email body. React auto-escapes every text node. */
async function renderHtml(
  kind: "daily" | "weekly",
  subject: string,
  header: string,
  footer: string,
  resolved: ReadonlyArray<{ section: { kind: string; text: string } }>,
): Promise<string> {
  const tree = (
    <EmailShell subject={subject} header={header} footer={footer}>
      {resolved.map(({ section }, i) => {
        if (kind === "daily") {
          const k = section.kind as SectionKind;
          return (
            <DigestBlock
              key={`${k}-${i}`}
              kind={k}
              text={section.text}
              status={STATUS_BY_SECTION[k]}
            />
          );
        }
        // Weekly: a simple section block. Same React escape rules apply.
        return (
          <div key={`${section.kind}-${i}`}>
            <strong>{section.kind.toUpperCase()}</strong>
            <p>{section.text}</p>
          </div>
        );
      })}
    </EmailShell>
  );
  return render(tree);
}

export default defineTool({
  description:
    "Validate a structured digest report against the collected source corpus, render it, " +
    "and deliver it to the configured recipient via Resend. Every reference id in the report " +
    "must resolve to an entry the collect_activity tool returned. Pass preview=true to render " +
    "the email to disk without sending or mutating delivery state.",
  inputSchema: SubmitInputSchema,
  endsTurn: true,
  label: {
    start: ({ kind, preview }) =>
      preview ? `Preview ${kind} digest (no send)` : `Deliver ${kind} digest`,
  },
  async execute({ kind, report, preview }) {
    if (env.AGENTS_PAUSED) {
      throw new Error(
        "Agent is paused (env.AGENTS_PAUSED=true). The delivery will not be sent.",
      );
    }

    const corpus = sourceCorpus.get();
    if (corpus.windowEnd === "") {
      throw new Error(
        "submit_digest: corpus is empty — call collect_activity first",
      );
    }
    if (corpus.kind !== kind) {
      throw new Error(
        `submit_digest: report kind="${kind}" does not match corpus kind="${corpus.kind}". ` +
          `Call collect_activity again before submitting.`,
      );
    }

    const refMap = (kind === "daily"
      ? DAILY_REF_KINDS
      : WEEKLY_REF_KINDS) as Record<string, ReadonlyArray<string>>;
    const resolved = resolveReferences(report, corpus.sources, refMap);

    const id = digestIdFor(env.GITHUB_ORG, kind, corpus.windowStart, corpus.windowEnd);
    const subject =
      kind === "daily"
        ? `Daily digest — ${report.date} [${id}]`
        : `Weekly recap — week of ${report.date} [${id}]`;
    const header = `Org: ${env.GITHUB_ORG} · Data as of ${report.date} · Digest ID: ${id}`;
    const footer = `Generated by the Technical Analyst. List-Unsubscribe: <${env.UNSUBSCRIBE_BASE_URL}/unsubscribe/${id}>, <mailto:${env.UNSUBSCRIBE_MAILTO}>.`;

    const html = await renderHtml(kind, subject, header, footer, resolved);
    const text = resolved
      .map(({ section }) => `${section.kind.toUpperCase()}: ${section.text}`)
      .join("\n\n");

    if (preview) {
      const dir = "tmp";
      await mkdir(dir, { recursive: true });
      const path = join(dir, `preview-${kind}-${id}-${Date.now()}.html`);
      await writeFile(path, html, "utf8");
      // Preview MUST NOT mark the edition as delivered.
      return { status: "preview", path, digestId: id };
    }

    const email = createEmailClient({
      apiKey: env.RESEND_API_KEY,
      from: { name: env.RESEND_FROM_NAME, address: env.RESEND_FROM_ADDRESS },
      ...(env.RESEND_REPLY_TO !== undefined ? { replyTo: env.RESEND_REPLY_TO } : {}),
      unsubscribeBaseUrl: env.UNSUBSCRIBE_BASE_URL,
      unsubscribeMailto: env.UNSUBSCRIBE_MAILTO,
    });

    let result: SendResult;
    try {
      result = await email.send({
        to: env.DIGEST_RECIPIENT,
        subject,
        html,
        text,
        digestId: id,
        tags: [
          { name: "agent", value: "technical-analyst" },
          { name: "kind", value: kind },
          { name: "digest_id", value: id },
        ],
      });
    } catch (err) {
      // Resend rejected the send — the application-side state did
      // not change, so the next attempt is a clean retry. The
      // delivery log is NOT written; the schedule's failure
      // detector treats this run as failed.
      throw err;
    }

    // Successful send: persist the delivery record so the schedule's
    // success detector can confirm. An interrupted retry that already
    // got a 200 from Resend must NOT regenerate the payload (which
    // would change the canonical identity of the edition).
    deliveryLog.update(() => ({
      kind,
      recipient: env.DIGEST_RECIPIENT,
      digestId: id,
      idempotencyKey: result.idempotencyKey,
      messageId: result.id,
      sentAt: new Date().toISOString(),
    }));

    return {
      status: "delivered",
      digestId: id,
      messageId: result.id,
      idempotencyKey: result.idempotencyKey,
    };
  },
});