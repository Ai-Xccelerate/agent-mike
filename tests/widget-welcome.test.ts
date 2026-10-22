import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { applyWorkerPatch } from "@/lib/worker-settings";

let orgId: string;

beforeEach(async () => {
  orgId = `welcome-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, orgId);
  await getOrCreateProfile(orgId);
});

afterEach(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("the widget's welcome message and quick actions", () => {
  it("start unset, so every existing worker keeps the built-in greeting", async () => {
    const profile = await getOrCreateProfile(orgId);
    expect(profile.welcomeMessage).toBeNull();
    expect(profile.quickActions).toBeNull();
  });

  it("are saved, trimmed, and read back", async () => {
    const result = await applyWorkerPatch(orgId, {
      welcomeMessage: "  Hi, I'm {name}. Ask me anything about EAP Expert.  ",
      quickActions: ["  Report a bug ", "Ask a question"],
    });
    expect(result.ok).toBe(true);
    const profile = await getOrCreateProfile(orgId);
    expect(profile.welcomeMessage).toBe("Hi, I'm {name}. Ask me anything about EAP Expert.");
    expect(profile.quickActions).toEqual(["Report a bug", "Ask a question"]);
  });

  it("go back to the built-in ones when cleared", async () => {
    await applyWorkerPatch(orgId, { welcomeMessage: "Hello", quickActions: ["One"] });
    const cleared = await applyWorkerPatch(orgId, { welcomeMessage: "", quickActions: null });
    expect(cleared.ok).toBe(true);
    const profile = await getOrCreateProfile(orgId);
    expect(profile.welcomeMessage).toBeNull();
    expect(profile.quickActions).toBeNull();
  });

  it("refuse a message over 300 characters, and bad quick actions", async () => {
    const long = await applyWorkerPatch(orgId, { welcomeMessage: "x".repeat(301) });
    expect(long.ok).toBe(false);
    const empty = await applyWorkerPatch(orgId, { quickActions: ["Fine", "  "] });
    expect(empty.ok).toBe(false);
    const tooLong = await applyWorkerPatch(orgId, { quickActions: ["x".repeat(41)] });
    expect(tooLong.ok).toBe(false);
    const tooMany = await applyWorkerPatch(orgId, { quickActions: ["1", "2", "3", "4", "5", "6", "7"] });
    expect(tooMany.ok).toBe(false);
  });

  it("leave the other settings alone", async () => {
    const before = await getOrCreateProfile(orgId);
    await applyWorkerPatch(orgId, { welcomeMessage: "Hello" });
    const after = await getOrCreateProfile(orgId);
    expect(after.displayName).toBe(before.displayName);
    expect(after.emailSignature).toBe(before.emailSignature);
  });
});
