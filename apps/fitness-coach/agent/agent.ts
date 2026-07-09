import { defineAgent } from "eve";
import { minimax } from "vercel-minimax-ai-provider";

// Use the direct MiniMax provider (not AI Gateway).
// Talks to https://api.minimax.io/anthropic/v1 using the Anthropic Messages format.
export default defineAgent({
  model: minimax("MiniMax-M3"),
  build: {
    externalDependencies: ["ai"],
  },
});