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

  it("logger.child() inside withAgentContext merges context tags + child bindings", async () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-x" });
    await withAgentContext(
      { agent: "agent-x", run_id: "run-77", schedule: "weekly-recap" },
      async () => {
        const child = logger.child({ component: "recap", user_id: "u-9" });
        child.info("child-line");
      },
    );
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    const record = captured[0] as Record<string, unknown>;
    // Context tags inherited:
    expect(record["agent.name"]).toBe("agent-x");
    expect(record["agent.run_id"]).toBe("run-77");
    expect(record["agent.schedule"]).toBe("weekly-recap");
    // Child bindings applied:
    expect(record.component).toBe("recap");
    expect(record.user_id).toBe("u-9");
  });

  it("projects genai.* tags from ctx.genai onto every log line", async () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-x" });
    await withAgentContext(
      {
        agent: "agent-x",
        run_id: "run-genai",
        genai: {
          provider: "anthropic",
          operation: "chat",
          model: "claude-sonnet-4-5",
          input_tokens: 100,
          output_tokens: 200,
          finish_reasons: ["end_turn"],
        },
      },
      async () => {
        logger.info("after-llm-call");
      },
    );
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    const record = captured[0] as Record<string, unknown>;
    expect(record["gen_ai.provider.name"]).toBe("anthropic");
    expect(record["gen_ai.operation.name"]).toBe("chat");
    expect(record["gen_ai.request.model"]).toBe("claude-sonnet-4-5");
    expect(record["gen_ai.usage.input_tokens"]).toBe(100);
    expect(record["gen_ai.usage.output_tokens"]).toBe(200);
    expect(record["gen_ai.response.finish_reasons"]).toEqual(["end_turn"]);
  });

  it("projects ctx.correlation_parent_agent onto correlation.parent_agent tag", async () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-child" });
    await withAgentContext(
      {
        agent: "agent-child",
        run_id: "run-corr",
        correlation_parent_agent: "agent-parent",
      },
      async () => {
        logger.info("inside-child");
      },
    );
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    const record = captured[0] as Record<string, unknown>;
    expect(record["correlation.parent_agent"]).toBe("agent-parent");
    // Standard agent.* tags are still emitted alongside the correlation tag.
    expect(record["agent.name"]).toBe("agent-child");
    expect(record["agent.run_id"]).toBe("run-corr");
  });

  it("projects arbitrary ctx.extra fields onto context.* tags", async () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-extra" });
    await withAgentContext(
      {
        agent: "agent-extra",
        run_id: "run-extra",
        extra: {
          tenant: "acme",
          ticket_count: 7,
          dry_run: true,
        },
      },
      async () => {
        logger.info("inside-extra");
      },
    );
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    const record = captured[0] as Record<string, unknown>;
    // Each `extra` key lands under the `context.*` namespace so the
    // standard agent.* / gen_ai.* / correlation.* namespaces stay clean.
    expect(record["context.tenant"]).toBe("acme");
    expect(record["context.ticket_count"]).toBe(7);
    expect(record["context.dry_run"]).toBe(true);
  });

  it("logs outside the scope never carry correlation.parent_agent or context.* tags", async () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-no-context" });
    await withAgentContext(
      {
        agent: "agent-no-context",
        run_id: "run-x",
        correlation_parent_agent: "agent-parent",
        extra: { tenant: "acme" },
      },
      async () => {
        // Establish scope and immediately exit.
      },
    );
    logger.info("after-scope");
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    const record = captured[0] as Record<string, unknown>;
    expect(record["correlation.parent_agent"]).toBeUndefined();
    expect(record["context.tenant"]).toBeUndefined();
  });
});
