/**
 * Tests for `withAgentContext` — context scoping, isolation between parallel
 * scopes, and exception safety.
 *
 * The strategy: build a capturing logger once and exercise the context store
 * directly by calling the logger inside and outside an `withAgentContext`
 * scope. This proves that the active context (or absence thereof) flows into
 * the log records.
 */

import { describe, expect, it } from "vitest";

import { getActiveContext } from "../src/context-store.ts";
import { withAgentContext } from "../src/with-context.ts";
import { makeCapturingLogger } from "./test-utils.ts";

describe("withAgentContext", () => {
  it("makes the context available via getActiveContext inside the callback", async () => {
    let observed: ReturnType<typeof getActiveContext>;
    await withAgentContext({ agent: "agent-x", run_id: "run-1" }, async () => {
      observed = getActiveContext();
    });
    expect(observed).toBeDefined();
    expect(observed?.agent).toBe("agent-x");
    expect(observed?.run_id).toBe("run-1");
  });

  it("logs emitted inside the callback carry the canonical agent.* tags", async () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-x" });
    await withAgentContext(
      { agent: "agent-x", run_id: "run-42", schedule: "daily-digest" },
      async () => {
        logger.info("inside-scope");
      },
    );
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    expect(captured[0]?.msg).toBe("inside-scope");
    expect(captured[0]?.["agent.name"]).toBe("agent-x");
    expect(captured[0]?.["agent.run_id"]).toBe("run-42");
    expect(captured[0]?.["agent.schedule"]).toBe("daily-digest");
  });

  it("logs emitted outside the callback do NOT carry the context tags", async () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-y" });
    await withAgentContext({ agent: "agent-y", run_id: "run-99" }, async () => {
      // intentionally empty — just establish the scope
    });
    logger.info("after-context");
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    expect(captured[0]?.msg).toBe("after-context");
    expect(captured[0]?.["agent.run_id"]).toBeUndefined();
    expect(captured[0]?.["agent.schedule"]).toBeUndefined();
  });

  it("clears the context when the callback throws (no leak)", async () => {
    await expect(
      withAgentContext({ agent: "agent-err", run_id: "run-err" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Context must be gone after the throw.
    expect(getActiveContext()).toBeUndefined();
  });

  it("parallel withAgentContext calls do not share state", async () => {
    const observed: Array<{ agent: string; run_id: string | undefined }> = [];
    const tasks = Array.from({ length: 5 }, (_, i) =>
      withAgentContext({ agent: "agent-par", run_id: `run-${i}` }, async () => {
        // Yield so other tasks can interleave.
        await new Promise((resolve) => setTimeout(resolve, 5));
        const ctx = getActiveContext();
        observed.push({ agent: ctx?.agent ?? "", run_id: ctx?.run_id });
      }),
    );
    await Promise.all(tasks);
    expect(observed).toHaveLength(5);
    for (const entry of observed) {
      expect(entry.agent).toBe("agent-par");
      expect(entry.run_id).toMatch(/^run-\d$/);
    }
    // Each task must have observed its own run_id.
    const ids = new Set(observed.map((o) => o.run_id));
    expect(ids.size).toBe(5);
  });
});
