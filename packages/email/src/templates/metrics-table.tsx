/**
 * Week-over-week metrics table for the weekly digest.
 *
 * Renders a 4-column table (Metric | This wk | Last wk | Trend).
 * React auto-escapes the values on render. The trend column is
 * rendered as an up/down arrow with the trend word ("up", "down",
 * "flat") in the matching color.
 */
import * as React from "react";
import { Heading, Section } from "react-email";
import { formatNumber } from "../format-number.ts";

import { tokens } from "./tokens.ts";
import type { Theme } from "./tokens.ts";

export type TrendKind = "up" | "down" | "flat";
/**
 * Editorial flag on a trend: "good" (the desired direction),
 * "bad" (the undesired direction), or "neutral" (no judgement).
 */
export type TrendTone = "good" | "bad" | "neutral";

export interface MetricRow {
  /** Row label (e.g. "PRs merged", "Cycle time (med)"). */
  readonly label: string;
  /** Current-week value (pre-formatted by the agent, e.g. "38"). */
  readonly this: string;
  /** Last-week value. */
  readonly last: string;
  /** Direction of the change. */
  readonly trend: TrendKind;
  /** Editorial tone of the direction. */
  readonly tone: TrendTone;
}

const TREND_ARROW: Record<TrendKind, string> = {
  up: "▲",
  down: "▼",
  flat: "▬",
};

const TONE_COLOR_KEY: Record<TrendTone, keyof typeof tokens.light> = {
  good: "success",
  bad: "danger",
  neutral: "muted",
};

export interface MetricsTableProps {
  readonly title: string;
  readonly rows: ReadonlyArray<MetricRow>;
  /** Theme override. Default: "light". */
  readonly theme?: Theme;
}

/**
 * Compose a numeric helper: when `this` and `last` are pure integers,
 * compute a delta. Otherwise leave the input string untouched. Used by
 * tests to confirm the right helper is wired in.
 */
export function describeDelta(thisValue: string, lastValue: string): string | null {
  const t = Number(thisValue);
  const l = Number(lastValue);
  if (!Number.isFinite(t) || !Number.isFinite(l) || t === l) return null;
  return formatNumber(t - l);
}

export function MetricsTable({
  title,
  rows,
  theme = "light",
}: MetricsTableProps): React.ReactElement {
  // Narrow to the single theme's token object so `t.foreground` etc.
  // type-check without bleeding in the `rag` token shape.
  const t = theme === "dark" ? tokens.dark : tokens.light;
  return (
    <Section
      style={{
        marginTop: tokens.spacing.lg,
        marginBottom: tokens.spacing.lg,
      }}
    >
      <Heading
        as="h2"
        style={{
          fontSize: tokens.fontSize.h2,
          color: t.foreground,
          margin: `0 0 ${tokens.spacing.sm} 0`,
        }}
      >
        {title}
      </Heading>
      <table
        cellPadding={0}
        cellSpacing={0}
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: tokens.fontSize.small,
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", color: t.muted, padding: tokens.spacing.xs }}>
              Metric
            </th>
            <th style={{ textAlign: "right", color: t.muted, padding: tokens.spacing.xs }}>
              This wk
            </th>
            <th style={{ textAlign: "right", color: t.muted, padding: tokens.spacing.xs }}>
              Last wk
            </th>
            <th style={{ textAlign: "right", color: t.muted, padding: tokens.spacing.xs }}>
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${t.sectionDivider}` }}>
              <td style={{ padding: tokens.spacing.xs, color: t.foreground }}>{row.label}</td>
              <td style={{ padding: tokens.spacing.xs, textAlign: "right", color: t.foreground }}>
                {row.this}
              </td>
              <td style={{ padding: tokens.spacing.xs, textAlign: "right", color: t.muted }}>
                {row.last}
              </td>
              <td
                style={{
                  padding: tokens.spacing.xs,
                  textAlign: "right",
                  color: t[TONE_COLOR_KEY[row.tone]],
                }}
              >
                {TREND_ARROW[row.trend]} {row.tone !== "neutral" ? row.tone : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
