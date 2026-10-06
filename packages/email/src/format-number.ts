/**
 * Format a count as a compact human number ("1.5K", "2.3M").
 *
 * Bounds (chosen to match what humans actually read in a digest):
 *   - < 1_000       → integer as-is
 *   - < 1_000_000   → "X.YK" (e.g., "13.2K")
 *   - < 1_000_000_000 → "X.YZ" (e.g., "2.3M")
 *   - ≥ 1B          → "X.YB" (e.g., "1.5B")
 *
 * Always uses 1 decimal place for K/M/B. Negative numbers preserve sign.
 * NaN → "0" (the digest must never show "NaN").
 */
const UNITS = ["", "K", "M", "B"] as const;

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1_000) return `${sign}${Math.round(abs)}`;

  let scaled = abs;
  let unitIndex = 0;
  while (scaled >= 1_000 && unitIndex < UNITS.length - 1) {
    scaled /= 1_000;
    unitIndex += 1;
  }
  return `${sign}${scaled.toFixed(1)}${UNITS[unitIndex]}`;
}