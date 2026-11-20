import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_KEY = process.env.COMPOSIO_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = ORIGINAL_KEY;
  vi.resetModules();
});

describe("composio client lazy COMPOSIO_API_KEY", () => {
  it("imports without throwing when COMPOSIO_API_KEY is unset", async () => {
    delete process.env.COMPOSIO_API_KEY;
    vi.resetModules();
    await expect(import("@/lib/tools-integrations/composio-client")).resolves.toMatchObject({
      getComposioClient: expect.any(Function),
    });
  });

  it("getComposioClient throws when COMPOSIO_API_KEY is unset", async () => {
    delete process.env.COMPOSIO_API_KEY;
    vi.resetModules();
    const { getComposioClient } = await import("@/lib/tools-integrations/composio-client");
    expect(() => getComposioClient()).toThrow(
      "COMPOSIO_API_KEY is not set. Get an API key from the Composio dashboard.",
    );
  });
});

describe("a raw request through a connection", () => {
  const proxyExecute = vi.fn(async (_options: Record<string, unknown>) => ({ status: 200, data: { ok: true } }));

  async function client() {
    process.env.COMPOSIO_API_KEY = "test-key";
    vi.resetModules();
    vi.doMock("@composio/core", () => ({ Composio: class { tools = { proxyExecute }; } }));
    return import("@/lib/tools-integrations/composio-client");
  }

  it("sends the headers it is given as header parameters, and none when it is given none", async () => {
    proxyExecute.mockClear();
    const { proxyRequest } = await client();

    await proxyRequest({ connectedAccountId: "ca_1", endpoint: "https://x/y", method: "GET", headers: { "X-ExperimentalApi": "opt-in" } });
    expect(proxyExecute).toHaveBeenLastCalledWith(expect.objectContaining({ parameters: [{ name: "X-ExperimentalApi", value: "opt-in", in: "header" }] }));

    await proxyRequest({ connectedAccountId: "ca_1", endpoint: "https://x/y", method: "GET" });
    expect(proxyExecute.mock.calls.at(-1)?.[0]).not.toHaveProperty("parameters");
  });
});
