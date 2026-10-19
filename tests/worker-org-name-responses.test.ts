import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { PATCH } from "@/app/api/v1/worker/route";
import { DELETE, POST } from "@/app/api/v1/worker/avatar/route";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { ORGANIZATION_NAME_FALLBACK, getOrCreateProfile } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";

const previousAdapter = getIdentityAdapter();
const savedUploadsDir = process.env.UPLOADS_DIR;
let orgId: string;
let uploadsDir: string;

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/v1/worker", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      duplex: "half" as const,
    }),
  );
}

function avatarUpload() {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "face.png");
  return POST(new NextRequest("http://localhost/api/v1/worker/avatar", { method: "POST", body: form }));
}

beforeEach(async () => {
  orgId = `org_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  uploadsDir = path.join(tmpdir(), `avatar-org-${crypto.randomUUID()}`);
  process.env.UPLOADS_DIR = uploadsDir;
  await getOrCreateProfile(orgId);
  setIdentityAdapter({
    resolveManagerRequest: async () => ({ orgId, userId: "manager", role: "owner", source: "test" }),
    resolveWidgetRequest: async () => null,
  });
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  if (savedUploadsDir === undefined) delete process.env.UPLOADS_DIR;
  else process.env.UPLOADS_DIR = savedUploadsDir;
  await rm(uploadsDir, { recursive: true, force: true });
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("replies that replace the profile on the Settings page keep the organization name", () => {
  it("PATCH /worker returns it, so the prompt preview never reads 'undefined'", async () => {
    const body = await json(await patch({ tone: "Calm and clear." }));
    expect(body.tone).toBe("Calm and clear.");
    expect(body.organizationName).toBe(ORGANIZATION_NAME_FALLBACK);
    expect(String(body.organizationName)).not.toContain("org_");
  });

  it("returns the real name once it is known", async () => {
    await db.update(organizations).set({ name: "EAP Expert Software" }).where(eq(organizations.id, orgId));
    expect((await json(await patch({ tone: "Calm." }))).organizationName).toBe("EAP Expert Software");
  });

  it("the avatar upload and removal return it too, and the new file name does not contain the org id", async () => {
    const uploaded = await json(await avatarUpload());
    expect(uploaded.organizationName).toBe(ORGANIZATION_NAME_FALLBACK);
    expect(uploaded.avatarUrl).toMatch(/^\/api\/v1\/uploads\/avatars\/avatar-[a-f0-9]{32}\.png$/);
    expect(String(uploaded.avatarUrl)).not.toContain(orgId.toLowerCase().replace(/_/g, "-"));

    const removed = await json(await DELETE(new NextRequest("http://localhost/api/v1/worker/avatar", { method: "DELETE" })));
    expect(removed.organizationName).toBe(ORGANIZATION_NAME_FALLBACK);
    expect(removed.avatarUrl).toBeNull();
  });
});
