/**
 * Format a fraction (0..1) as a percentage string ("12.5%", "100%").
 *
 * Examples:
 *   formatPercent(0.125)  → "12.5%"
 *   formatPercent(1)      → "100%"
 *   formatPercent(0)      → "0%"
 *   formatPercent(0.1234) → "12.3%"  (rounds to 1 decimal place)
 *
 * Inputs outside [0, 1] throw — call sites must clamp first. NaN/Infinity
 * throw. Returns "0%" only for `null`-style inputs? No — keep the strict
 * contract: percentages must be meaningful numbers in range.
 */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) {
    throw new RangeError(`formatPercent: fraction must be a finite number, got ${fraction}`);
  }
  if (fraction < 0 || fraction > 1) {
    throw new RangeError(`formatPercent: fraction must be in [0, 1], got ${fraction}`);
  }
  const pct = fraction * 100;
  // Show whole numbers without decimals ("100%" not "100.0%"); keep
  // 1-decimal precision otherwise so a 12.34% → "12.3%" doesn't lose
  // information that matters for CFR-style metrics.
  if (Number.isInteger(pct) || pct === 100) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}
