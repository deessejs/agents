import { defineAgent } from "eve";
import { minimax } from "vercel-minimax-ai-provider";

// deessejs-errors-tech-lead — eve scaffold (phase 1).
//
// Scope is bounded to deessejs/errors; residence is in ds-team.
// All knowledge of the target repo flows through the GitHub MCP,
// which lands in phase 2. In this phase the agent has no tools yet.
//
// Model: MiniMax-M3 via the direct provider (not AI Gateway).
// See apps/head-of-engineering/agent/agent.ts for the rationale.
export default defineAgent({
  model: minimax("MiniMax-M3"),
  build: {
    externalDependencies: ["ai", "@ai-sdk/groq"],
  },
});