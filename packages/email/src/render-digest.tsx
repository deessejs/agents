/**
 * `renderDigestHtml` — render a list of resolved digest sections into a
 * React-Email HTML body + a plain-text fallback.
 *
 * Lives in `@workspace/email` (not the agent) so the agent's tool
 * modules can stay as `.ts` files — Eve's authored-module discovery
 * only supports `.ts` and `.js` variants, not `.tsx`.
 *
 * The renderer receives ONLY resolved corpus entries. The agent's
 * text annotation is passed in as `section.text`; URLs and titles
 * come from the corpus (`entry.url`, `entry.title`), so the model
 * cannot fabricate links or invent titles. Each section's references
 * are rendered as an explicit `<ul>` with corpus-derived URLs.
 */
import * as React from "react";
import { render } from "react-email";

import { EmailShell, DigestBlock } from "./templates/index.ts";
import type { SectionKind, RagStatus } from "./templates/index.ts";

export interface ResolvedSection {
  readonly kind: string;
  readonly text: string;
  readonly references: ReadonlyArray<{
    readonly id: string;
    readonly url: string;
    readonly title: string;
  }>;
}

export interface RenderDigestInput {
  readonly kind: "daily" | "weekly";
  readonly subject: string;
  readonly header: string;
  readonly footer: string;
  readonly sections: ReadonlyArray<ResolvedSection>;
  /** Status per daily section kind. Ignored for weekly (weekly has no accent). */
  readonly statusByKind?: Record<SectionKind, RagStatus>;
}

/**
 * Daily-section kind → RAG status. The model can override per call,
 * but this default encodes the editorial decision: shipped=green,
 * risks=red, tldr/watchlist=yellow (worth knowing but neutral).
 */
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
 * Render an ordered list of resolved sections. The returned `text` is a
 * plain-text fallback that explicitly includes the corpus URLs so
 * non-HTML clients still see the auditable links.
 */
export async function renderDigest(input: RenderDigestInput): Promise<RenderedDigest> {
  const statusByKind = input.statusByKind ?? DEFAULT_STATUS_BY_KIND;

  const tree = (
    <EmailShell subject={input.subject} header={input.header} footer={input.footer}>
      {input.sections.map((section, i) => {
        const refKey = `${input.kind}-${section.kind}-${i}`;
        if (input.kind === "daily") {
          return (
            <div key={refKey}>
              <DigestBlock
                kind={section.kind as SectionKind}
                text={section.text}
                status={statusByKind[section.kind as SectionKind]}
              />
              <ReferencesList references={section.references} />
            </div>
          );
        }
        return (
          <div key={refKey}>
            <h2 style={{ textTransform: "uppercase", marginBottom: 4 }}>{section.kind}</h2>
            <p style={{ marginTop: 0 }}>{section.text}</p>
            <ReferencesList references={section.references} />
          </div>
        );
      })}
    </EmailShell>
  );
  const html = await render(tree);

  // Plain-text fallback — includes the URLs so auditability holds
  // even when the recipient's client doesn't render HTML.
  const text = input.sections
    .map((section) => {
      const refBlock =
        section.references.length === 0
          ? ""
          : "\n  " + section.references.map((r) => r.url).join("\n  ");
      return `${section.kind.toUpperCase()}: ${section.text}${refBlock}`;
    })
    .join("\n\n");

  return { html, text };
}

function ReferencesList(props: {
  references: ReadonlyArray<{ id: string; url: string; title: string }>;
}): React.ReactElement | null {
  if (props.references.length === 0) return null;
  return (
    <ul
      style={{
        margin: "4px 0 12px 0",
        paddingLeft: 18,
        fontSize: 13,
        listStyle: "disc",
      }}
    >
      {props.references.map((r) => (
        <li key={r.id}>
          <a href={r.url}>{r.title}</a>
        </li>
      ))}
    </ul>
  );
}
