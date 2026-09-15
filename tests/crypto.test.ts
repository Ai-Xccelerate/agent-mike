import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
  vi.resetModules();
});

describe("crypto lazy ENCRYPTION_KEY", () => {
  it("imports without throwing when ENCRYPTION_KEY is unset", async () => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
    await expect(import("@/lib/crypto")).resolves.toMatchObject({
      encrypt: expect.any(Function),
      decrypt: expect.any(Function),
    });
  });

  it("encrypt throws when ENCRYPTION_KEY is unset", async () => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
    const { encrypt } = await import("@/lib/crypto");
    expect(() => encrypt("secret")).toThrow(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  });

  it("decrypt throws when ENCRYPTION_KEY is unset", async () => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
    const { decrypt } = await import("@/lib/crypto");
    expect(() => decrypt("AAAA")).toThrow(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  });
});
