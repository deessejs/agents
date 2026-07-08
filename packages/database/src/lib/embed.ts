import { embed } from "ai";
import { gateway } from "@ai-sdk/gateway";

/**
 * Embed text using Vercel AI Gateway → openai/text-embedding-3-small.
 *
 * MiniMax-M3 does not expose an embeddings endpoint, so we route through
 * the Gateway (1536 dimensions, cosine-compatible with pgvector HNSW).
 *
 * Failure mode: returns null if the call fails. Callers must handle null.
 */
export async function embedText(text: string): Promise<number[] | null> {
  try {
    const result = await embed({
      model: gateway.textEmbeddingModel("openai/text-embedding-3-small"),
      value: text,
    });
    return result.embedding;
  } catch (err) {
    console.error("[embed] failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
