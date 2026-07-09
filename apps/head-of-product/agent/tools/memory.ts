// eve autoloads tools from `agent/tools/*.ts`.
// This tool exposes the memory interface for the Head of Product.
// Scope defaults to 'product' for all writes.
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  searchMemories,
  writeMemory,
  updateMemory,
  forgetMemory,
  readCoreMemory,
} from "@ds-team/database/queries";

const SCOPE = "product";

function resolvePath(path: string): { tier: string; metadata: Record<string, unknown> } {
  if (path === "/memories/core.md") return { tier: "core", metadata: {} };
  if (path === "/memories/conversations.jsonl") return { tier: "recall", metadata: {} };
  const dateMatch = /^\/memories\/notes\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path);
  if (dateMatch) return { tier: "archival", metadata: { date: dateMatch[1] } };
  return { tier: "core", metadata: { path } };
}

export default defineTool({
  description: `Read and maintain long-term memory under /memories.

Rules:
- Search before answering when the user prompt depends on past decisions,
  preferences, project state, or people.
- For high-priority durable facts (name, preferences, current project), use
  command 'update' on path '/memories/core.md' with mode 'append'.
- For dated notes and decisions, use 'create' with a path under
  '/memories/notes/YYYY-MM-DD.md'.
- For full conversation recall, search scope='shared', tier='recall'.
- Use 'forget' with an id from a previous search result to honor RGPD.`,
  inputSchema: z.object({
    command: z.enum(["view", "create", "update", "search", "forget"]),
    path: z.string().optional(),
    content: z.string().optional(),
    mode: z.enum(["append", "overwrite"]).optional(),
    query: z.string().optional(),
    scope: z.enum(["engineering", "product", "shared"]).optional(),
    tier: z.enum(["core", "archival", "episodic", "recall"]).optional(),
    id: z.number().int().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  async execute(input) {
    const { command, path, content, mode, query, scope, tier, id, limit } = input;

    switch (command) {
      case "view": {
        if (!path) throw new Error("'view' requires 'path'");
        resolvePath(path);
        return await readCoreMemory();
      }

      case "create": {
        if (!content) throw new Error("'create' requires 'content'");
        const resolved = path ? resolvePath(path) : { tier: tier ?? "core", metadata: {} };
        const row = await writeMemory({
          scope: scope ?? SCOPE,
          tier: resolved.tier,
          content,
          metadata: resolved.metadata,
        });
        return { id: row.id, message: `Memory created (id: ${row.id})` };
      }

      case "update": {
        if (id === undefined || !content || !mode) {
          throw new Error("'update' requires 'id', 'content', and 'mode'");
        }
        const row = await updateMemory(id, content, mode);
        return { id: row?.id, message: `Memory updated (id: ${row?.id})` };
      }

      case "search": {
        if (!query) throw new Error("'search' requires 'query'");
        const results = await searchMemories({
          query,
          scopes: scope ? [scope] : undefined,
          tiers: tier ? [tier] : undefined,
          limit: limit ?? 10,
        });
        return { results };
      }

      case "forget": {
        if (id === undefined) throw new Error("'forget' requires 'id'");
        await forgetMemory(id);
        return { message: `Memory ${id} scheduled for deletion (soft delete, 30d retention)` };
      }

      default:
        throw new Error(`Unknown command: ${command satisfies never}`);
    }
  },
});
