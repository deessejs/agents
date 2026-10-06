/**
 * Format a Date as a human-relative phrase ("3 hours ago", "in 2 days").
 *
 * Thin wrapper over `date-fns/formatDistance` with the project's
 * default locale ("enUS"). `addSuffix: true` is the only difference from
 * the underlying API — callers shouldn't have to remember to set it.
 *
 * The optional `now` parameter pins the reference time, which makes the
 * function deterministic in tests. **Note:** we use `formatDistance` here
 * instead of `formatDistanceToNow` because date-fns v4's
 * `formatDistanceToNow` calls `constructNow(date)` internally and ignores
 * the `options.now` field — see node_modules/.pnpm/date-fns@4.4.0/...
 * /formatDistanceToNow.cjs. `formatDistance(date, now, options)` honors
 * the second argument directly.
 *
 * Production callers leave `now` unset and get the actual `Date.now()`.
 *
 * Future: if we add multilingual digests, this becomes
 * `relativeTime(date, { locale, tz })` with a typed locale union.
 */
import { formatDistance } from "date-fns";

export function relativeTime(date: Date, now?: Date): string {
  return formatDistance(date, now ?? new Date(), { addSuffix: true });
}
