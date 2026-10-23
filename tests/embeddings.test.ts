import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, EmbeddingUnavailableError, cosine, createEmbedder } from "@/lib/embeddings";

const previousKey = process.env.OPENAI_API_KEY;
const previousDemo = process.env.DEMO_MODE;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.DEMO_MODE;
});
afterEach(() => {
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
  if (previousDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previousDemo;
});

function reply(inputs: string[]) {
  // Returned out of order on purpose: the client must put them back in the order asked.
  const data = inputs.map((text, index) => ({ index, embedding: [text.length, index] })).reverse();
  return new Response(JSON.stringify({ data }), { status: 200 });
}

describe("embedding text", () => {
  it("asks for the configured model and size, and returns vectors in the order asked", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => reply(JSON.parse(String(init?.body)).input));
    const vectors = await createEmbedder(fetchMock as unknown as typeof fetch)(["a", "bbb", "cc"]);
    expect(vectors).toEqual([[1, 0], [3, 1], [2, 2]]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ model: "text-embedding-3-small", dimensions: EMBEDDING_DIMENSIONS });
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
  });

  it("sends large lists in batches of 64", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => reply(JSON.parse(String(init?.body)).input));
    const vectors = await createEmbedder(fetchMock as unknown as typeof fetch)(Array.from({ length: 150 }, (_, i) => `t${i}`));
    expect(vectors).toHaveLength(150);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).input.length)).toEqual([64, 64, 22]);
  });

  it("retries a failed batch once, then gives up", async () => {
    let calls = 0;
    const flaky = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls += 1;
      return calls === 1 ? new Response("{}", { status: 500 }) : reply(JSON.parse(String(init?.body)).input);
    });
    expect(await createEmbedder(flaky as unknown as typeof fetch)(["x"])).toEqual([[1, 0]]);
    const down = vi.fn(async () => new Response("{}", { status: 503 }));
    await expect(createEmbedder(down as unknown as typeof fetch)(["x"])).rejects.toThrow("503");
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an empty list, and says plainly when there is no key", async () => {
    const fetchMock = vi.fn();
    expect(await createEmbedder(fetchMock as unknown as typeof fetch)([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    delete process.env.OPENAI_API_KEY;
    await expect(createEmbedder(fetchMock as unknown as typeof fetch)(["x"])).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a response that does not match the request", async () => {
    const short = vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] }), { status: 200 }));
    await expect(createEmbedder(short as unknown as typeof fetch)(["a", "b"])).rejects.toThrow("did not match");
  });
});

describe("cosine similarity", () => {
  it("is 1 for the same direction, 0 for unrelated, and 0 for empty", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([], [1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
