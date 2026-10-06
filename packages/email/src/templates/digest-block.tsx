/**
 * A single digest section block (TL;DR, Shipped, Risks, Watchlist).
 *
 * Renders a section header + a text body. React auto-escapes the text
 * on render — XSS payloads in the text are inert by construction.
 *
 * Per the runtime doc's "editorial principles" (BLUF, so-what, quantify,
 * no "all green"):
 *   - Each block gets a distinct color tint so the eye finds the
 *     signal color first (red Risks > amber Watchlist > green Shipped)
 *   - The header uses a RAG emoji (per design §6.1) when `status` is set
 */
import * as React from "react";
import { Heading, Section, Text } from "react-email";

import { tokens } from "./tokens.ts";
import type { Theme } from "./tokens.ts";

export type SectionKind = "tldr" | "shipped" | "risks" | "watchlist";
export type RagStatus = "green" | "yellow" | "red";

const KIND_LABEL: Record<SectionKind, string> = {
  tldr: "TL;DR",
  shipped: "Shipped",
  risks: "Risks & blockers",
  watchlist: "Watchlist for tomorrow",
};

const RAG_EMOJI: Record<RagStatus, string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
};

const KIND_ACCENT: Record<SectionKind, keyof typeof tokens.light> = {
  tldr: "muted",
  shipped: "success",
  risks: "danger",
  watchlist: "warn",
};

export interface DigestBlockProps {
  /** Section kind. Drives both the label and the accent color. */
  readonly kind: SectionKind;
  /** Plain-text body. React auto-escapes this on render. */
  readonly text: string;
  /** Optional RAG status — prepends an emoji to the header. */
  readonly status?: RagStatus;
  /** Theme override. Default: "light". */
  readonly theme?: Theme;
}

export function DigestBlock({
  kind,
  text,
  status,
  theme = "light",
}: DigestBlockProps): React.ReactElement {
  // Narrow to the single theme's token object so `t.foreground` etc.
  // type-check without bleeding in the `rag` token shape.
  const t = theme === "dark" ? tokens.dark : tokens.light;
  const accent = t[KIND_ACCENT[kind]];
  const label =
    status !== undefined ? `${RAG_EMOJI[status]} ${KIND_LABEL[kind]}` : KIND_LABEL[kind];
  return (
    <Section
      style={{
        borderLeft: `3px solid ${accent}`,
        paddingLeft: tokens.spacing.md,
        marginTop: tokens.spacing.md,
        marginBottom: tokens.spacing.md,
      }}
    >
      <Heading
        as="h2"
        style={{
          fontSize: tokens.fontSize.h2,
          color: accent,
          margin: `0 0 ${tokens.spacing.sm} 0`,
        }}
      >
        {label}
      </Heading>
      <Text
        style={{
          fontSize: tokens.fontSize.body,
          lineHeight: "1.5",
          color: t.foreground,
          margin: 0,
        }}
      >
        {text}
      </Text>
    </Section>
  );
}
