/**
 * @workspace/email/templates — React Email components for agent digests.
 *
 * Public surface:
 *   - EmailShell      — top-level layout (header / footer / content slot)
 *   - DigestBlock     — one section (TL;DR, Shipped, Risks, Watchlist)
 *   - MetricsTable    — week-over-week table for the weekly digest
 *   - tokens          — design tokens (light + dark themes)
 *   - SectionKind, RagStatus — discriminated unions for the editor
 *   - MetricRow, TrendKind, TrendTone — types for MetricsTable
 *   - describeDelta   — pure helper for tests / call sites
 */
export { EmailShell } from "./email-shell.tsx";
export type { EmailShellProps } from "./email-shell.tsx";
export { DigestBlock } from "./digest-block.tsx";
export type { DigestBlockProps, SectionKind, RagStatus } from "./digest-block.tsx";
export { MetricsTable, describeDelta } from "./metrics-table.tsx";
export type { MetricsTableProps, MetricRow, TrendKind, TrendTone } from "./metrics-table.tsx";
export { tokens } from "./tokens.ts";
export type { Tokens, Theme } from "./tokens.ts";
