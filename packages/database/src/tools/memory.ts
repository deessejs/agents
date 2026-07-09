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
 * agentId is set by the runtime (closure on `ctx.agent.id`) and is NOT
 * exposed via the Zod input schema — the LLM cannot fake it.
 *
 * Known agent ids:
 *   - "head-of-engineering"
 *   - "head-of-product"
 *   - "general-assistant"
 *   - "deessejs-errors-tech-lead"
 */

// Agent id whitelist — keeps tool inputs from asking for unknown ids.
const KNOWN_AGENT_IDS: readonly KnownAgentId[] = [
  "head-of-engineering",
  "head-of-product",
  "general-assistant",
  "deessejs-errors-tech-lead",
] as const;

const TOPIC_VALUES = [
  "engineering",
  "product",
  "deessejs-errors",
  "general",
] as const;
const TIER_VALUES = ["core", "archival", "episodic", "recall"] as const;
const VISIBILITY_VALUES = ["owner", "shared", "public"] as const;

const knownAgentIdSchema = z.enum(KNOWN_AGENT_IDS as unknown as [KnownAgentId, ...KnownAgentId[]]);
const topicSchema = z.enum(TOPIC_VALUES as unknown as [Topic, ...Topic[]]);
const tierSchema = z.enum(TIER_VALUES as unknown as [Tier, ...Tier[]]);
const visibilitySchema = z.enum(VISIBILITY_VALUES as unknown as [Visibility, ...Visibility[]]);

// ============================================================================
// memory: the main tool (view/create/update/search/forget)
// ============================================================================

const memoryInputSchema = z.object({
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
});

export default defineTool({
  description: `Read and maintain long-term memory under /memories.

Commands:
- view    : read core memory for the calling agent
- create  : write a new memory (optionally sharing it)
- update  : append or overwrite an existing memory by id (owner only)
- search  : keyword search; results respect the caller's visibility
- forget  : soft-delete a memory (owner only)

Rules:
- Search before answering when the prompt depends on past decisions,
  preferences, project state, or people.
- Durable facts → 'create' on path '/memories/core.md' (tier='core').
- Dated notes → 'create' with path under '/memories/notes/YYYY-MM-DD.md'.
- Cross-agent recall → search with topic='shared'? No — topic isn't
  "shared" (topic is the domain). Use search without filters; visibility
  filtering shows you what's accessible to you automatically.
- Use 'forget' with an id from a previous search result for RGPD.`,
  inputSchema: memoryInputSchema,
  async execute(input, ctx) {
    const agentId = requireAgentId(ctx);
    const { command } = input;

    switch (command) {
      case "view": {
        if (!input.path) throw new Error("'view' requires 'path'");
        // Path resolution kept for compatibility; we only honor '/memories/core.md'.
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
        return { message: `Memory ${input.id} scheduled for deletion (soft, 30d)` };
      }

      default:
        throw new Error(`Unknown command: ${(command satisfies never) as string}`);
    }
  },
});

function resolveCreateTier(path: string | undefined, fallback: Tier | undefined): Tier {
  if (path === "/memories/core.md") return "core";
  if (path === "/memories/conversations.jsonl") return "recall";
  if (path && /^\/memories\/notes\/\d{4}-\d{2}-\d{2}\.md$/.test(path)) return "archival";
  return fallback ?? "core";
}

/**
 * Pulls `agent.id` out of the eve tool execution context.
 * Throws if the runtime did not supply one — this is a deployment
 * misconfiguration, not an LLM error.
 */
function requireAgentId(ctx: unknown): AgentId {
  const c = ctx as { agent?: { id?: string } } | undefined;
  const id = c?.agent?.id;
  if (!id) {
    throw new Error(
      "Tool invoked without agent context. Check that the agent is deployed with an explicit identity (eve runtime must populate ctx.agent.id).",
    );
  }
  if (!KNOWN_AGENT_IDS.includes(id as KnownAgentId)) {
    throw new Error(`Unknown agent id: ${id}. Update packages/database KnownAgentId list.`);
  }
  return id as AgentId;
}

// ============================================================================
// memory_share: explicit cross-agent visibility grant
// ============================================================================

export const memoryShare = defineTool({
  description: `Share one of your memories with another agent. The target
agent gains read access. Use when the calling agent decides another agent
needs a specific fact that was previously private.

Only the owning agent can share its own memory.`,
  inputSchema: z.object({
    memory_id: z.number().int(),
    target_agent_id: knownAgentIdSchema,
    reason: z.string().optional(),
  }),
  async execute(input, ctx) {
    const ownerId = requireAgentId(ctx);
    const row = await shareMemory({
      memoryId: input.memory_id,
      ownerId,
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

// ============================================================================
// memory_unshare: revoke a previously-granted share
// ============================================================================

export const memoryUnshare = defineTool({
  description: `Revoke a previously-granted share. The target agent loses
read access. If no shared readers remain, the memory reverts to 'owner'
visibility.`,
  inputSchema: z.object({
    memory_id: z.number().int(),
    target_agent_id: knownAgentIdSchema,
  }),
  async execute(input, ctx) {
    const ownerId = requireAgentId(ctx);
    const row = await unshareMemory({
      memoryId: input.memory_id,
      ownerId,
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
