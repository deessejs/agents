/**
 * Format a millisecond duration as a compact human phrase ("1d 4h",
 * "2h 30m", "45s"). Drops zero-leading units. Negative durations throw
 * — call sites must clamp to 0 first.
 *
 * Examples:
 *   formatDuration(0)        → "0s"
 *   formatDuration(45_000)   → "45s"
 *   formatDuration(90_000)   → "1m 30s"
 *   formatDuration(3_600_000)→ "1h"
 *   formatDuration(3_900_000)→ "1h 5m"
 *   formatDuration(100_000_000) → "1d 3h"
 */
const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`formatDuration: ms must be a finite number, got ${ms}`);
  }
  if (ms < 0) {
    throw new RangeError(`formatDuration: ms must be non-negative, got ${ms}`);
  }

  if (ms < MS_PER_MINUTE) {
    const seconds = Math.round(ms / MS_PER_SECOND);
    return `${seconds}s`;
  }

  if (ms < MS_PER_HOUR) {
    const minutes = Math.floor(ms / MS_PER_MINUTE);
    const seconds = Math.round((ms % MS_PER_MINUTE) / MS_PER_SECOND);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  if (ms < MS_PER_DAY) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    const minutes = Math.round((ms % MS_PER_HOUR) / MS_PER_MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.round((ms % MS_PER_DAY) / MS_PER_HOUR);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}
