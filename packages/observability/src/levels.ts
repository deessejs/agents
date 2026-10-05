/**
 * Canonical log level names. Exported as a constant tuple so the mapped
 * {@link Logger} type and the runtime level table stay in sync.
 */

export const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

/** Union of valid pino level names. */
export type LevelName = (typeof LEVELS)[number];
