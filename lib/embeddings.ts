import { modelUnavailabilityReason } from "@/lib/env";

/**
 * Turns text into a list of numbers that captures what it means, so a question and a section that say the same thing in
 * different words end up close together. It only converts text; it does not read, reason about or keep anything.
 */

export const EMBEDDING_MODEL = (process.env.EMBEDDING_MODEL || "").trim() || "text-embedding-3-small";
/** 512 numbers per text: plenty to tell sections of one organization apart, and a third of the default size. */
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS) > 0 ? Number(process.env.EMBEDDING_DIMENSIONS) : 512;
const BATCH_SIZE = 64;
const TIMEOUT_MS = 20_000;

export class EmbeddingUnavailableError extends Error {}

export type Embedder = (texts: string[]) => Promise<number[][]>;

async function requestBatch(texts: string[], fetchImpl: typeof fetch): Promise<number[][]> {
  const response = await fetchImpl("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`embeddings request failed with ${response.status}`);
  const body = (await response.json()) as { data?: { index: number; embedding: number[] }[] };
  const rows = [...(body.data ?? [])].sort((a, b) => a.index - b.index);
  if (rows.length !== texts.length) throw new Error("embeddings response did not match the request");
  return rows.map((row) => row.embedding);
}

/** Embeds many texts, in batches, retrying a failed batch once. Throws if it cannot, so a sync leaves the page for next time. */
export function createEmbedder(fetchImpl: typeof fetch = fetch): Embedder {
  return async (texts) => {
    if (texts.length === 0) return [];
    if (modelUnavailabilityReason()) throw new EmbeddingUnavailableError("No model key is configured, so sections cannot be embedded");
    const out: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE);
      try {
        out.push(...(await requestBatch(batch, fetchImpl)));
      } catch {
        out.push(...(await requestBatch(batch, fetchImpl)));
      }
    }
    return out;
  };
}

export const embedTexts: Embedder = (texts) => createEmbedder()(texts);

/** Cosine similarity of two same-length vectors; 0 when either is empty. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
