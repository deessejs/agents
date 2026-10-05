import { EnvValidationError } from "./error.ts";

/**
 * Returns the value of `process.env[key]` or throws if it is missing.
 *
 * Intended for one-off reads outside the schema flow. Prefer declaring
 * every env var in a schema and going through {@link createEnv} when
 * you can.
 *
 * @throws {EnvValidationError} when the variable is unset or empty.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new EnvValidationError(`[agent-env] Missing required env var: ${key}`, [
      { key, message: "Required" },
    ]);
  }
  return value;
}
