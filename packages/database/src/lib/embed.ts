/**
 * Embed text using OpenAI's text-embedding-3-small via OpenRouter.
 *
 * Uses OPENROUTER_API_KEY. 1536 dimensions, compatible with pgvector HNSW.
 *
 * Failure mode: returns null if the call fails. Callers must handle null.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[embed] OPENROUTER_API_KEY is not set");
    return null;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      console.error(`[embed] OpenRouter failed (${response.status}): ${await response.text()}`);
      return null;
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("[embed] failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
