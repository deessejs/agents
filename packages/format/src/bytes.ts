/**
 * Format a byte count as a compact human phrase ("12.5 MB", "1.5 KB").
 * Uses SI units (powers of 1000), matching `ls -h`/`df -h` and most
 * release-asset dashboards. For powers-of-1024 (IEC), use the explicit
 * `KiB`/`MiB` variant.
 *
 * Examples:
 *   formatBytes(0)        → "0 B"
 *   formatBytes(512)      → "512 B"
 *   formatBytes(1500)     → "1.5 KB"
 *   formatBytes(12_500_000) → "12.5 MB"
 *
 * Negative numbers throw — byte counts are unsigned. NaN/Infinity throw.
 */
const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    throw new RangeError(`formatBytes: bytes must be a finite number, got ${bytes}`);
  }
  if (bytes < 0) {
    throw new RangeError(`formatBytes: bytes must be non-negative, got ${bytes}`);
  }

  let scaled = bytes;
  let unitIndex = 0;
  while (scaled >= 1_000 && unitIndex < UNITS.length - 1) {
    scaled /= 1_000;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${Math.round(scaled)} ${UNITS[unitIndex]}`;
  }
  return `${scaled.toFixed(1)} ${UNITS[unitIndex]}`;
}
