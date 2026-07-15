import { defineAgent } from "eve";
import { minimax } from "vercel-minimax-ai-provider";

// Use the direct MiniMax provider (not AI Gateway).
// Talks to https://api.minimax.io/anthropic/v1 using the Anthropic Messages format.
//
// `@ai-sdk/groq` is included as an external dependency because the shared
// Telegram channel (re-exported from @ds-team/agent-core) uses Groq Whisper
// for voice-message transcription at runtime.
export default defineAgent({
  model: minimax("MiniMax-M3"),
  build: {
    externalDependencies: ["ai", "@ai-sdk/groq"],
  },
});
