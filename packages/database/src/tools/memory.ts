import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  searchMemories,
  writeMemory,
  updateMemory,
  shareMemory,
  unshareMemory,
  forgetMemory,
  readCoreMemory,
} from "../queries.js";
import type { AgentId, KnownAgentId, Topic, Tier, Visibility } from "../schema.js";

/**
 * Memory tools for a single agent. agentId is baked in at construction
 * time (via the factory's closure), so the LLM cannot impersonate another
 * agent. This is Rule 1 of
 * docs/internal/reports/memory-schema-refactor-2026-07-09.md.
 *
 * Usage per agent app:
 *
 *   // apps/head-of-engineering/agent/tools/memory.ts
 *   import { createMemoryTools } from "@ds-team/database/tools/memory";
 *   const tools = createMemoryTools("head-of-engineering");
 *   export default tools.memory;
 *   export const memoryShare = tools.memoryShare;
 *   export const memoryUnshare = tools.memoryUnshare;
 *
 *   // apps/.../agent/instructions/core-injection.ts
 *   const core = await readCoreMemory({ viewerId: "head-of-engineering" });
 */

const TOPIC_VALUES = [
  "engineering",
  "product",
  "deessejs-errors",
  "general",
] as const;
const TIER_VALUES = ["core", "archival", "episodic", "recall"] as const;
const VISIBILITY_VALUES = ["owner", "shared", "public"] as const;

const KNOWN_AGENT_IDS: readonly KnownAgentId[] = [
  "head-of-engineering",
  "head-of-product",
  "general-assistant",
  "deessejs-errors-tech-lead",
  "home-automation-assistant",
  "fitness-coach",
] as const;

const knownAgentIdSchema = z.enum(
  KNOWN_AGENT_IDS as unknown as [KnownAgentId, ...KnownAgentId[]],
);
const topicSchema = z.enum(TOPIC_VALUES as unknown as [Topic, ...Topic[]]);
const tierSchema = z.enum(TIER_VALUES as unknown as [Tier, ...Tier[]]);
const visibilitySchema = z.enum(
  VISIBILITY_VALUES as unknown as [Visibility, ...Visibility[]],
);

export interface MemoryTools {
  memory: unknown;
  memoryShare: unknown;
  memoryUnshare: unknown;
}

export function createMemoryTools(agentId: AgentId): MemoryTools {
  if (!KNOWN_AGENT_IDS.includes(agentId)) {
    throw new Error(
      `Unknown agent id: "${agentId}". Update packages/database KNOWN_AGENT_IDS list.`,
    );
  }

  // ==========================================================================
  // memory: the main tool (view/create/update/search/forget)
  // ==========================================================================

  const memory = defineTool({
    description: `Read and maintain long-term memory under /memories for the ${agentId} agent.

Commands:
- view    : read core memory for ${agentId}
- create  : write a new memory (optionally sharing it)
- update  : append or overwrite an existing memory by id (owner only)
- search  : keyword search; results respect ${agentId}'s visibility
- forget  : soft-delete a memory (owner only)

Rules:
- Search before answering when the prompt depends on past decisions,
  preferences, project state, or people.
- Durable facts → 'create' on path '/memories/core.md' (tier='core').
- Dated notes → 'create' with path under '/memories/notes/YYYY-MM-DD.md'.
- Use 'forget' with an id from a previous search result for RGPD.`,
    inputSchema: z.object({
      command: z.enum(["view", "create", "update", "search", "forget"]),
      path: z.string().optional(),
      content: z.string().optional(),
      mode: z.enum(["append", "overwrite"]).optional(),
      query: z.string().optional(),
      topic: topicSchema.optional(),
      tier: tierSchema.optional(),
      visibility: visibilitySchema.optional(),
      visibleTo: z.array(knownAgentIdSchema).min(1).optional(),
      id: z.number().int().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async execute(input) {
      const { command } = input;

      switch (command) {
        case "view": {
          if (!input.path) throw new Error("'view' requires 'path'");
          if (input.path !== "/memories/core.md") {
            throw new Error(`Unsupported view path: ${input.path}`);
          }
          return await readCoreMemory({ viewerId: agentId });
        }

        case "create": {
          if (!input.content) throw new Error("'create' requires 'content'");
          const tier = resolveCreateTier(input.path, input.tier);
          const row = await writeMemory({
            agentId,
            topic: input.topic ?? "general",
            tier,
            content: input.content,
            filename: input.path ?? null,
            visibility: input.visibility,
            visibleTo: input.visibleTo,
          });
          return { id: row?.id, message: `Memory created (id: ${row?.id})` };
        }

        case "update": {
          if (input.id === undefined || !input.content || !input.mode) {
            throw new Error("'update' requires 'id', 'content', and 'mode'");
          }
          const row = await updateMemory({
            id: input.id,
            viewerId: agentId,
            content: input.content,
            mode: input.mode,
          });
          return { id: row?.id, message: `Memory updated (id: ${row?.id})` };
        }

        case "search": {
          if (!input.query) throw new Error("'search' requires 'query'");
          const results = await searchMemories({
            agentId,
            query: input.query,
            topics: input.topic ? [input.topic] : undefined,
            tiers: input.tier ? [input.tier] : undefined,
            limit: input.limit ?? 10,
          });
          return {
            results: results.map((r) => ({
              id: r.id,
              agentId: r.agentId,
              topic: r.topic,
              tier: r.tier,
              visibility: r.visibility,
              content: r.content,
              createdAt: r.createdAt,
            })),
          };
        }

        case "forget": {
          if (input.id === undefined) throw new Error("'forget' requires 'id'");
          await forgetMemory({ id: input.id, viewerId: agentId });
          return {
            message: `Memory ${input.id} scheduled for deletion (soft, 30d)`,
          };
        }

        default:
          throw new Error(
            `Unknown command: ${(command satisfies never) as string}`,
          );
      }
    },
  });

  // ==========================================================================
  // memory_share: explicit cross-agent visibility grant
  // ==========================================================================

  const memoryShare = defineTool({
    description: `Share one of ${agentId}'s memories with another agent. The
target agent gains read access. Use when the calling agent decides another
agent needs a specific fact that was previously private.

Only ${agentId} can share its own memories.`,
    inputSchema: z.object({
      memory_id: z.number().int(),
      target_agent_id: knownAgentIdSchema,
      reason: z.string().optional(),
    }),
    async execute(input) {
      const row = await shareMemory({
        memoryId: input.memory_id,
        ownerId: agentId,
        targetAgentId: input.target_agent_id,
        reason: input.reason,
      });
      return {
        ok: true,
        memory_id: row?.id,
        visibility: row?.visibility,
        visible_to: row?.visibleTo,
      };
    },
  });

  // ==========================================================================
  // memory_unshare: revoke a previously-granted share
  // ==========================================================================

  const memoryUnshare = defineTool({
    description: `Revoke a previously-granted share from one of ${agentId}'s
memories. The target agent loses read access. If no shared readers remain,
the memory reverts to 'owner' visibility.`,
    inputSchema: z.object({
      memory_id: z.number().int(),
      target_agent_id: knownAgentIdSchema,
    }),
    async execute(input) {
      const row = await unshareMemory({
        memoryId: input.memory_id,
        ownerId: agentId,
        targetAgentId: input.target_agent_id,
      });
      return {
        ok: true,
        memory_id: row?.id,
        visibility: row?.visibility,
        visible_to: row?.visibleTo,
      };
    },
  });

  return { memory, memoryShare, memoryUnshare };
}

function resolveCreateTier(path: string | undefined, fallback: Tier | undefined): Tier {
  if (path === "/memories/core.md") return "core";
  if (path === "/memories/conversations.jsonl") return "recall";
  if (path && /^\/memories\/notes\/\d{4}-\d{2}-\d{2}\.md$/.test(path)) return "archival";
  return fallback ?? "core";
}