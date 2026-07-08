/**
 * Embed text using Groq's nomic-embed-text-v1.5 model.
 *
 * Groq does not support embeddings via @ai-sdk/groq, so we call the REST API
 * directly with GROQ_API_KEY. 768 dimensions, compatible with pgvector HNSW.
 *
 * Failure mode: returns null if the call fails. Callers must handle null.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[embed] GROQ_API_KEY is not set");
    return null;
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nomic-embed-text-v1_5",
        input: text,
      }),
    });

    if (!response.ok) {
      console.error(`[embed] Groq failed (${response.status}): ${await response.text()}`);
      return null;
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("[embed] failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
