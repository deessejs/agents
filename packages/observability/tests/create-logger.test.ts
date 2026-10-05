/**
 * Tests for `createLogger` — JSON output, level filtering, tag injection,
 * child logger merging.
 *
 * Note: the capture stream lives behind `wrapPino`, which is what
 * `createLogger` uses internally. We exercise the factory through the same
 * pipeline so the tests reflect what real consumers see.
 */

import { describe, expect, it } from "vitest";

import { makeCapturingLogger } from "./test-utils.ts";

describe("createLogger", () => {
  it("emits valid JSON to the underlying stream", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.info("hello world");
    const captured = records();
    expect(captured).toHaveLength(1);
    const record = captured[0] as { msg: string; level: number; "agent.name": string };
    expect(record.msg).toBe("hello world");
    expect(typeof record.level).toBe("number");
    expect(record["agent.name"]).toBe("agent-test");
  });

  it("filters below the configured level by default (info)", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.debug("debug-line");
    logger.info("info-line");
    logger.warn("warn-line");
    const captured = records() as Array<{ msg: string }>;
    expect(captured.map((r) => r.msg)).toEqual(["info-line", "warn-line"]);
  });

  it("respects a custom level from config", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test", level: "warn" });
    logger.info("info-suppressed");
    logger.warn("warn-emitted");
    const captured = records() as Array<{ msg: string }>;
    expect(captured.map((r) => r.msg)).toEqual(["warn-emitted"]);
  });

  it("injects the standard tags (agent.name, deployment.environment, service)", () => {
    const { logger, records } = makeCapturingLogger({
      agent: "agent-tagging",
      env: "staging",
    });
    logger.info("check tags");
    const record = records()[0] as Record<string, unknown>;
    expect(record["agent.name"]).toBe("agent-tagging");
    expect(record["deployment.environment"]).toBe("staging");
    expect(record.service).toBe("agent-tagging");
  });

  it("child() merges fields and they appear on every log line", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    const child = logger.child({ component: "digest", user_id: "u-42" });
    child.info("first");
    child.info("second", { extra: 1 });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(2);
    for (const record of captured) {
      expect(record.component).toBe("digest");
      expect(record.user_id).toBe("u-42");
    }
    expect(captured[1]?.extra).toBe(1);
  });

  it("exposes all 6 log levels as runtime-callable methods", () => {
    const { logger, records } = makeCapturingLogger({
      agent: "agent-test",
      level: "trace",
    });
    logger.trace("t");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");
    const captured = records() as Array<{ msg: string; level: number }>;
    expect(captured).toHaveLength(6);
    // Pino level numbers: trace=10, debug=20, info=30, warn=40, error=50, fatal=60.
    expect(captured.map((r) => r.level)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(captured.map((r) => r.msg)).toEqual(["t", "d", "i", "w", "e", "f"]);
  });
});
