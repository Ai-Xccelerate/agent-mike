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
