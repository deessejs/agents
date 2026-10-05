/**
 * Test helpers for capturing pino output without touching the real process
 * stdout. Each helper returns the captured JSON lines plus the underlying
 * wrapped logger so test assertions can read parsed log objects directly.
 */

import { Writable } from "node:stream";

import pino, { type Logger as PinoLogger } from "pino";

import { wrapPino } from "../src/logger.ts";
import { createRedactor } from "../src/redact/index.ts";
import { STANDARD_TAGS } from "../src/tags.ts";
import type { Logger, LoggerConfig } from "../src/types.ts";

/**
 * Collect every JSON line pino writes. A line is a complete record terminated
 * by `\n` (the default pino behavior).
 */
class CollectingWritable extends Writable {
  readonly chunks: string[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    for (const line of text.split("\n")) {
      if (line.length > 0) this.chunks.push(line);
    }
    callback();
  }
}

/**
 * Build a {@link Logger} that writes to an in-memory stream and return both
 * the logger and a snapshot of the captured records as parsed JSON.
 */
export function makeCapturingLogger(config: LoggerConfig): {
  logger: Logger;
  records: () => unknown[];
  stream: CollectingWritable;
} {
  const stream = new CollectingWritable();
  const pinoInstance: PinoLogger = pino(
    {
      level: config.level ?? "info",
      base: {
        [STANDARD_TAGS.AGENT_NAME]: config.agent,
        service: config.agent,
        ...(config.env ? { [STANDARD_TAGS.DEPLOYMENT_ENV]: config.env } : {}),
      },
      serializers: { err: pino.stdSerializers.err },
      ...createRedactor({
        paths: config.redactPaths,
        valuePatterns: config.redactValuePatterns,
      }),
    },
    stream,
  );
  const logger = wrapPino(pinoInstance);
  const records = (): unknown[] => stream.chunks.map((line) => JSON.parse(line) as unknown);
  return { logger, records, stream };
}
