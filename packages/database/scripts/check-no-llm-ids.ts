/**
 * Guardrail: ensure no LLM-exposed Zod schema in @ds-team/database/tools
 * accepts `agent_id` or `actor_agent_id` as a writable field.
 *
 * These values identify the OWNING/ACTING agent and must be set by the
 * runtime (closure on ctx.agent.id). If a future contributor accidentally
 * exposes them via the Zod input, the LLM could impersonate another
 * agent — Rule 1 in
 * docs/internal/reports/memory-schema-refactor-2026-07-09.md.
 *
 * Note: `target_agent_id` IS legitimately LLM-controlled in `memory_share`
 * and `memory_unshare` — that's the *recipient* of the share, which is
 * different from the *actor*. It's not on the forbidden list.
 *
 * Run: pnpm --filter @ds-team/database guardrail
 */

import { z } from "zod";
import memoryTool, { memoryShare, memoryUnshare } from "../src/tools/memory.js";

const FORBIDDEN_KEYS = ["agent_id", "actor_agent_id"] as const;

const TOOLS_TO_CHECK = [
  { name: "memory", tool: memoryTool },
  { name: "memory_share", tool: memoryShare },
  { name: "memory_unshare", tool: memoryUnshare },
] as const;

function collectForbiddenKeys(schema: unknown, path: string[] = []): string[] {
  if (!(schema instanceof z.ZodType)) return [];
  const found: string[] = [];

  // Unwrap optional / nullable wrappers
  let inner: unknown = schema;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
    inner = (inner as { _def: { innerType: unknown } })._def.innerType;
  }

  if (inner instanceof z.ZodObject) {
    const shape = (inner as { shape: Record<string, z.ZodTypeAny> }).shape;
    for (const [key, child] of Object.entries(shape)) {
      if (FORBIDDEN_KEYS.includes(key as (typeof FORBIDDEN_KEYS)[number])) {
        found.push([...path, key].join("."));
      }
      found.push(...collectForbiddenKeys(child, [...path, key]));
    }
  }

  return found;
}

let failed = false;

for (const { name, tool } of TOOLS_TO_CHECK) {
  if (!tool || typeof tool !== "object") {
    console.error(`✗ ${name}: tool is not loaded (circular import or missing)`);
    failed = true;
    continue;
  }
  const schema = (tool as { inputSchema?: unknown }).inputSchema;
  if (!schema) {
    console.error(`✗ ${name}: no inputSchema found`);
    failed = true;
    continue;
  }
  const leaks = collectForbiddenKeys(schema);
  if (leaks.length === 0) {
    console.log(`✓ ${name}: no forbidden keys exposed`);
  } else {
    console.error(`✗ ${name}: forbidden keys exposed to LLM:`);
    for (const path of leaks) {
      console.error(`    - ${path}`);
    }
    failed = true;
  }
}

if (failed) {
  console.error("\nGUARDRAIL FAILED. Do not expose agent_id / actor_agent_id / target_agent_id via the Zod input schema — these are runtime-only.");
  process.exit(1);
}

console.log("\nAll tools pass the guardrail.");
