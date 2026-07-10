import { defineAgent } from "eve";
import { minimax } from "vercel-minimax-ai-provider";

// fitness-coach — personal training specialist for the user.
// Reachable on Telegram + eve HTTP; Exa MCP for web search.
// Deployed 2026-07-09 (initial), 2026-07-10 (redeploy).
//
// Use the direct MiniMax provider (not AI Gateway).
// Talks to https://api.minimax.io/anthropic/v1 using the Anthropic Messages format.
export default defineAgent({
  model: minimax("MiniMax-M3"),
  build: {
    externalDependencies: ["ai"],
  },
});