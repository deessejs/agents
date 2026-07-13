/**
 * Pure time-block formatter for the ds-team agent time-injection resolver.
 *
 * No I/O, no `Date.now()` — both inputs are parameters so the function is
 * unit-testable with a pinned Date and timezone. The per-agent resolver in
 * `apps/<agent>/agent/instructions/time-injection.ts` calls this with
 * `now = new Date()` and `tz = process.env.AGENT_TIMEZONE ?? "UTC"`.
 *
 * Output shape (UTC anchor + Local line with named TZ and offset + day
 * with ISO week). The Local line is what the model should use to resolve
 * relative phrases ("ce matin", "tomorrow", "next Friday").
 *
 *     ## Current time
 *
 *     - UTC:   2026-07-13T10:23:45Z
 *     - Local: Monday, July 13 2026, 12:23 (Europe/Paris, UTC+02:00)
 *     - Day:   Monday (week 29 of 2026)
 *
 *     _Refreshed on every turn. Anchor relative time references_
 *     _("ce matin", "tomorrow", "next Friday") against the Local line above._
 *
 * Invalid timezone strings fall back silently to UTC; this function never
 * throws.
 *
 * See docs/internal/reports/time-awareness-injection-2026-07-13.md.
 */

const FOOTER = [
  "_Refreshed on every turn. Anchor relative time references_",
  '_("ce matin", "tomorrow", "next Friday") against the Local line above._',
].join("\n");

export function formatTimeBlock(now: Date, tz: string): string {
  const safeTz = isValidTimezone(tz) ? tz : "UTC";
  return [
    "## Current time",
    "",
    `- UTC:   ${formatUtc(now)}`,
    `- Local: ${formatLocal(now, safeTz)}`,
    `- Day:   ${formatDay(now, safeTz)}`,
    "",
    FOOTER,
  ].join("\n");
}

function formatUtc(d: Date): string {
  // Strip the millisecond fraction for readability: "2026-07-13T10:23:45Z"
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function formatLocal(d: Date, tz: string): string {
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const offsetRaw =
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
    })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const offset = offsetRaw.replace(/^GMT/, "UTC");
  return `${datePart} (${tz}, ${offset})`;
}

function formatDay(d: Date, tz: string): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(d);
  const { week, year } = isoWeek(d, tz);
  return `${weekday} (week ${week} of ${year})`;
}

function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * ISO 8601 week number, computed against the local calendar in `tz`.
 *
 * Algorithm: take the local calendar date (year/month/day in `tz`), find
 * the Thursday of that week, then `week = ceil((dayOfYear(Thursday) + 1) / 7)`.
 * The year attached to the week is the ISO week-year (the year that
 * contains the Thursday), which can differ from the calendar year for
 * early-January and late-December dates.
 */
function isoWeek(d: Date, tz: string): { week: number; year: number } {
  // en-CA gives us ISO-style "YYYY-MM-DD" for the local calendar date.
  const localStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [yStr, mStr, dayStr] = localStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const day = Number(dayStr);
  const local = new Date(Date.UTC(y, m - 1, day));
  // 0 = Monday … 6 = Sunday
  const dow = (local.getUTCDay() + 6) % 7;
  const thursday = new Date(local);
  thursday.setUTCDate(local.getUTCDate() - dow + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { week, year: thursday.getUTCFullYear() };
}