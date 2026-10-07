/**
 * `renderDigest` — render resolved digest sections + edition context
 * into an HTML body + a plain-text fallback.
 *
 * Inputs come ONLY from the agent's corpus:
 *   - edition.repo / period / counts / weeklyMetrics / availability
 *   - sections[].items[].text (annotation) + .source.{id, kind, url, title}
 *
 * The model never supplies URLs or titles. The renderer combines the
 * annotation with the corpus-derived URL + title.
 *
 * **Quiet-period truth source.** A period is announced as quiet only
 * when the CORPUS supports that conclusion — i.e. authoritative counts
 * are zero across every collected kind AND no source reported an
 * availability issue. An empty `sections[]` from the model against a
 * non-empty corpus means the model returned nothing despite collected
 * activity; the renderer surfaces this as "no editorial items" while
 * the counts line keeps the authoritative evidence. Availability
 * warnings are always displayed.
 *
 * Plain-text output mirrors the HTML — annotations + URLs + titles are
 * present, not only the URL list.
 */
import * as React from "react";
import { render } from "react-email";

import { EmailShell, DigestBlock } from "./templates/index.ts";
import type { SectionKind, RagStatus } from "./templates/index.ts";

export interface DigestSource {
  readonly id: string;
  readonly kind: string;
  readonly url: string;
  readonly title: string;
}

export interface DigestItem {
  readonly text: string;
  readonly source: DigestSource;
}

export interface DigestSection {
  readonly kind: string;
  readonly items: ReadonlyArray<DigestItem>;
}

export interface DigestEdition {
  readonly repo: string;
  readonly period: { readonly start: string; readonly end: string; readonly label: string };
  readonly counts: Record<string, number>;
  readonly weeklyMetrics: Record<string, number> | null;
  readonly availability: ReadonlyArray<{ readonly reason: string }>;
}

export interface RenderDigestInput {
  readonly kind: "daily" | "weekly";
  readonly subject: string;
  readonly header: string;
  readonly footer: string;
  readonly edition: DigestEdition;
  readonly sections: ReadonlyArray<DigestSection>;
  /** Status per daily section kind. Ignored for weekly (weekly has no accent). */
  readonly statusByKind?: Record<SectionKind, RagStatus>;
}

export const DEFAULT_STATUS_BY_KIND: Record<SectionKind, RagStatus> = {
  tldr: "yellow",
  shipped: "green",
  risks: "red",
  watchlist: "yellow",
};

export interface RenderedDigest {
  readonly html: string;
  readonly text: string;
}

/**
 * A period is quiet when authoritative corpus counts are zero across
 * every kind AND no source reported an availability issue. An empty
 * `sections[]` from the model against a non-empty corpus is NOT quiet —
 * it's "model returned no editorial items"; the renderer keeps the
 * authoritative counts visible so the operator can see what the model
 * ignored.
 */
function isQuiet(edition: DigestEdition): boolean {
  if (edition.availability.length > 0) return false;
  const counts = edition.counts;
  const numericKeys = Object.values(counts).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (numericKeys.length === 0) return true;
  return numericKeys.every((n) => n === 0);
}

function editorialItemsCount(sections: ReadonlyArray<DigestSection>): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}

export async function renderDigest(input: RenderDigestInput): Promise<RenderedDigest> {
  const statusByKind = input.statusByKind ?? DEFAULT_STATUS_BY_KIND;
  const quiet = isQuiet(input.edition);
  const editorialCount = editorialItemsCount(input.sections);

  const tree = (
    <EmailShell subject={input.subject} header={input.header} footer={input.footer}>
      <EditionSummary edition={input.edition} quiet={quiet} editorialCount={editorialCount} />
      {input.sections.map((section, i) => (
        <div key={`${input.kind}-${section.kind}-${i}`}>
          <SectionBlock kind={input.kind} section={section} statusByKind={statusByKind} />
          <ReferencesList items={section.items} />
        </div>
      ))}
      <AvailabilityBlock availability={input.edition.availability} />
    </EmailShell>
  );
  const html = await render(tree);

  // Plain-text mirrors the HTML: section title, then each item
  // (annotation + url + title), then edition summary, then footer.
  const sectionText = input.sections
    .map((section) => {
      const items = section.items
        .map((i) => `  - ${i.text}\n    ${i.source.title}\n    ${i.source.url}`)
        .join("\n");
      return `${section.kind.toUpperCase()}${items ? `\n${items}` : ""}`;
    })
    .join("\n\n");
  const editionText = editionSummaryText(input.edition, quiet, editorialCount);
  const text = `${sectionText}${sectionText ? "\n\n" : ""}${editionText}\n\n${input.footer}`;
  return { html, text };
}

function SectionBlock(props: {
  kind: "daily" | "weekly";
  section: DigestSection;
  statusByKind: Record<SectionKind, RagStatus>;
}): React.ReactElement {
  const { section, kind, statusByKind } = props;
  const n = section.items.length;
  const summary = n === 0 ? "No items" : `${n} item${n === 1 ? "" : "s"}`;
  if (kind === "daily") {
    return (
      <DigestBlock
        kind={section.kind as SectionKind}
        text={summary}
        status={statusByKind[section.kind as SectionKind]}
      />
    );
  }
  return (
    <>
      <h2 style={{ textTransform: "uppercase", marginBottom: 4 }}>{section.kind}</h2>
      <p style={{ marginTop: 0 }}>{summary}</p>
    </>
  );
}

function EditionSummary(props: {
  edition: DigestEdition;
  quiet: boolean;
  editorialCount: number;
}): React.ReactElement {
  const { edition, quiet, editorialCount } = props;
  const wm = edition.weeklyMetrics;
  const countsNonZero =
    Object.values(edition.counts).filter(
      (v) => typeof v === "number" && Number.isFinite(v) && v !== 0,
    ).length > 0;
  return (
    <div
      style={{
        background: "#f6f8fa",
        border: "1px solid #d0d7de",
        borderRadius: 4,
        padding: 12,
        margin: "12px 0",
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      {quiet ? (
        <p style={{ margin: 0, fontWeight: 600 }}>
          No activity recorded for this period. Counts below confirm zero in every GitHub category
          the digest tried to fetch.
        </p>
      ) : countsNonZero && editorialCount === 0 ? (
        <p style={{ margin: 0, fontWeight: 600, color: "#9a6700" }}>
          The model returned no editorial items despite collected activity. Authoritative counts
          below are not affected; this digest may be incomplete.
        </p>
      ) : null}
      <p style={{ margin: "4px 0" }}>
        Period: <code>{edition.period.start}</code> → <code>{edition.period.end}</code> UTC (
        {edition.period.label})
      </p>
      <p style={{ margin: "4px 0" }}>
        Repo: <code>{edition.repo}</code>
      </p>
      <p style={{ margin: "4px 0" }}>
        Counts: merged PRs {edition.counts.merged_prs ?? 0} · open PRs{" "}
        {edition.counts.open_prs ?? 0} · opened issues {edition.counts.opened_issues ?? 0} · closed
        issues {edition.counts.closed_issues ?? 0} · Dependabot{" "}
        {edition.counts.dependabot_alerts ?? 0}
        {edition.counts.dependabot_critical !== null &&
        edition.counts.dependabot_critical !== undefined &&
        edition.counts.dependabot_critical > 0
          ? ` (${edition.counts.dependabot_critical} critical)`
          : ""}{" "}
        · CodeQL {edition.counts.code_scanning_alerts ?? 0} · secret-scanning{" "}
        {edition.counts.secret_scanning_alerts ?? 0} · failed runs{" "}
        {edition.counts.failed_workflow_runs ?? 0} · releases {edition.counts.releases ?? 0}
      </p>
      {wm ? (
        <p style={{ margin: "4px 0" }}>
          Weekly: {wm.merged_count ?? 0} merged · {wm.open_prs_count ?? 0} open PRs ·{" "}
          {wm.dependabot_open ?? 0} Dependabot open
          {wm.dependabot_critical !== null &&
          wm.dependabot_critical !== undefined &&
          wm.dependabot_critical > 0
            ? ` (${wm.dependabot_critical} critical)`
            : ""}{" "}
          · {wm.code_scanning_open ?? 0} CodeQL · {wm.secret_scanning_open ?? 0} secret ·{" "}
          {wm.failed_runs ?? 0} failed runs · {wm.releases_count ?? 0} releases
        </p>
      ) : null}
    </div>
  );
}

function AvailabilityBlock(props: {
  availability: ReadonlyArray<{ readonly reason: string }>;
}): React.ReactElement | null {
  if (props.availability.length === 0) return null;
  return (
    <div
      style={{
        background: "#fff8c5",
        border: "1px solid #d4a72c",
        borderRadius: 4,
        padding: 12,
        margin: "12px 0",
        fontSize: 13,
      }}
    >
      <strong>Data-source availability:</strong>
      <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
        {props.availability.map((a, i) => (
          <li key={i}>{a.reason}</li>
        ))}
      </ul>
    </div>
  );
}

function editionSummaryText(
  edition: DigestEdition,
  quiet: boolean,
  editorialCount: number,
): string {
  const lines: string[] = [];
  lines.push(
    `Period: ${edition.period.start} → ${edition.period.end} UTC (${edition.period.label})`,
  );
  lines.push(`Repo: ${edition.repo}`);
  lines.push(
    `Counts: merged PRs ${edition.counts.merged_prs ?? 0} · open PRs ${edition.counts.open_prs ?? 0} · ` +
      `opened issues ${edition.counts.opened_issues ?? 0} · closed issues ${edition.counts.closed_issues ?? 0} · ` +
      `Dependabot ${edition.counts.dependabot_alerts ?? 0}` +
      (edition.counts.dependabot_critical !== null &&
      edition.counts.dependabot_critical !== undefined &&
      edition.counts.dependabot_critical > 0
        ? ` (${edition.counts.dependabot_critical} critical)`
        : "") +
      ` · CodeQL ${edition.counts.code_scanning_alerts ?? 0} · secret-scanning ` +
      `${edition.counts.secret_scanning_alerts ?? 0} · failed runs ${edition.counts.failed_workflow_runs ?? 0} · ` +
      `releases ${edition.counts.releases ?? 0}`,
  );
  if (edition.weeklyMetrics) {
    const wm = edition.weeklyMetrics;
    lines.push(
      `Weekly: ${wm.merged_count ?? 0} merged · ${wm.open_prs_count ?? 0} open PRs · ` +
        `${wm.dependabot_open ?? 0} Dependabot open` +
        (wm.dependabot_critical !== null &&
        wm.dependabot_critical !== undefined &&
        wm.dependabot_critical > 0
          ? ` (${wm.dependabot_critical} critical)`
          : "") +
        ` · ${wm.code_scanning_open ?? 0} CodeQL · ${wm.secret_scanning_open ?? 0} secret · ` +
        `${wm.failed_runs ?? 0} failed runs · ${wm.releases_count ?? 0} releases`,
    );
  }
  if (edition.availability.length > 0) {
    lines.push(
      "Data-source availability: " + edition.availability.map((a) => a.reason).join(" | "),
    );
  }
  const countsNonZero =
    Object.values(edition.counts).filter(
      (v) => typeof v === "number" && Number.isFinite(v) && v !== 0,
    ).length > 0;
  if (quiet) {
    lines.unshift(
      "No activity recorded for this period. Counts above confirm zero in every GitHub category the digest tried to fetch.",
    );
  } else if (countsNonZero && editorialCount === 0) {
    lines.unshift(
      "The model returned no editorial items despite collected activity. Authoritative counts below are not affected; this digest may be incomplete.",
    );
  }
  return lines.join("\n");
}

function ReferencesList(props: { items: ReadonlyArray<DigestItem> }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <ul
      style={{
        margin: "4px 0 12px 0",
        paddingLeft: 18,
        fontSize: 13,
        listStyle: "disc",
      }}
    >
      {props.items.map((i) => (
        <li key={i.source.id}>
          <strong>{i.text}</strong>
          {" — "}
          <a href={i.source.url}>{i.source.title}</a>
        </li>
      ))}
    </ul>
  );
}
