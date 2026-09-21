import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSkills } from "@/app/api/v1/skills/route";
import { POST as createCustomSkillRoute } from "@/app/api/v1/skills/custom/route";
import { DELETE as deleteCustomSkillRoute, PATCH as patchCustomSkillRoute } from "@/app/api/v1/skills/custom/[id]/route";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { customSkillCreateSchema } from "@/lib/tools-integrations/custom-skill-schema";
import { createCustomSkill, deleteCustomSkill } from "@/lib/tools-integrations/custom-skills-repository";

const previousAdapter = getIdentityAdapter();

afterEach(() => {
  setIdentityAdapter(previousAdapter);
});

function jsonRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), duplex: "half" as const }),
  });
}

async function readJson(res: Response): Promise<{ status: number; body: unknown }> {
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function adapterFor(orgId: string): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({
      orgId,
      userId: "test-manager",
      role: "owner",
      source: "test",
    }),
    resolveWidgetRequest: async () => null,
  };
}

const validPayload = {
  name: "Ticket voice",
  description: "Write the ticket in the customer's own words.",
  requires: ["crm"] as string[],
  body: "# Ticket voice\nQuote the product and the failure.",
};

describe("custom skill create schema", () => {
  it("accepts current INTEGRATION_TYPES and rejects unknown requires entries", () => {
    expect(customSkillCreateSchema.safeParse(validPayload).success).toBe(true);
    expect(
      customSkillCreateSchema.safeParse({ ...validPayload, requires: [] }).success,
    ).toBe(true);

    const rejected = customSkillCreateSchema.safeParse({
      ...validPayload,
      requires: ["not-a-type"],
    });
    expect(rejected.success).toBe(false);
  });
});

describe("POST /api/v1/skills/custom", () => {
  it("rejects an invalid requires entry with 422", async () => {
    const rejectedRes = await createCustomSkillRoute(
      jsonRequest("POST", "http://localhost/api/v1/skills/custom", {
        ...validPayload,
        requires: ["slack"],
      }),
    );
    const rejected = await readJson(rejectedRes);
    expect(rejected.status).toBe(422);
    expect(rejected.body).toMatchObject({ error: "Invalid payload" });
    expect((rejected.body as { errors: Record<string, string> }).errors["requires.0"]).toMatch(
      /Unknown integration type/,
    );
  });

  it("creates a row scoped to the caller's org", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Custom skill POST org");
    setIdentityAdapter(adapterFor(orgId));

    const createdRes = await createCustomSkillRoute(
      jsonRequest("POST", "http://localhost/api/v1/skills/custom", validPayload),
    );
    const created = await readJson(createdRes);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      organizationId: orgId,
      name: validPayload.name,
      description: validPayload.description,
      requires: ["crm"],
      body: validPayload.body,
    });

    await deleteCustomSkill(orgId, (created.body as { id: string }).id);
  });
});

describe("PATCH /api/v1/skills/custom/[id]", () => {
  it("updates only provided fields and 404s for another org's id or a nonexistent id", async () => {
    const orgA = `org-${crypto.randomUUID()}`;
    const orgB = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgA, "Custom skill PATCH org A");
    await ensureOrganization(orgB, "Custom skill PATCH org B");

    setIdentityAdapter(adapterFor(orgA));
    const createdRes = await createCustomSkillRoute(
      jsonRequest("POST", "http://localhost/api/v1/skills/custom", validPayload),
    );
    const created = (await createdRes.json()) as { id: string; name: string; body: string };
    expect(created.name).toBe(validPayload.name);

    const patchedRes = await patchCustomSkillRoute(
      jsonRequest("PATCH", `http://localhost/api/v1/skills/custom/${created.id}`, {
        description: "Keep the summary short and factual.",
      }),
      { params: { id: created.id } },
    );
    const patched = await readJson(patchedRes);
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      id: created.id,
      name: validPayload.name,
      body: validPayload.body,
      description: "Keep the summary short and factual.",
    });

    const missingRes = await patchCustomSkillRoute(
      jsonRequest("PATCH", "http://localhost/api/v1/skills/custom/00000000-0000-4000-8000-000000000000", {
        name: "Nope",
      }),
      { params: { id: "00000000-0000-4000-8000-000000000000" } },
    );
    expect((await readJson(missingRes)).status).toBe(404);

    const foreign = await createCustomSkill({
      organizationId: orgB,
      name: "Org B skill",
      description: "Must not be editable from A",
      requires: [],
      body: "# B",
    });
    const foreignRes = await patchCustomSkillRoute(
      jsonRequest("PATCH", `http://localhost/api/v1/skills/custom/${foreign.id}`, {
        name: "Hijacked",
      }),
      { params: { id: foreign.id } },
    );
    expect((await readJson(foreignRes)).status).toBe(404);

    await deleteCustomSkill(orgA, created.id);
    await deleteCustomSkill(orgB, foreign.id);
  });
});

describe("DELETE /api/v1/skills/custom/[id]", () => {
  it("removes the row and 404s the second time", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Custom skill DELETE org");
    setIdentityAdapter(adapterFor(orgId));

    const createdRes = await createCustomSkillRoute(
      jsonRequest("POST", "http://localhost/api/v1/skills/custom", { ...validPayload, requires: [] }),
    );
    const created = (await createdRes.json()) as { id: string };

    const first = await deleteCustomSkillRoute(jsonRequest("DELETE", `http://localhost/api/v1/skills/custom/${created.id}`), {
      params: { id: created.id },
    });
    const firstBody = await readJson(first);
    expect(firstBody.status).toBe(200);
    expect(firstBody.body).toEqual({ ok: true });

    const second = await deleteCustomSkillRoute(jsonRequest("DELETE", `http://localhost/api/v1/skills/custom/${created.id}`), {
      params: { id: created.id },
    });
    const secondBody = await readJson(second);
    expect(secondBody.status).toBe(404);
    expect(secondBody.body).toMatchObject({ error: "Not found" });
  });
});

describe("GET /api/v1/skills after creating a custom skill", () => {
  it("shows the custom skill with source: custom", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Custom skill GET catalog org");
    setIdentityAdapter(adapterFor(orgId));

    const createdRes = await createCustomSkillRoute(
      jsonRequest("POST", "http://localhost/api/v1/skills/custom", validPayload),
    );
    const created = (await createdRes.json()) as { id: string };

    const listedRes = await getSkills(jsonRequest("GET", "http://localhost/api/v1/skills"));
    const listed = await readJson(listedRes);
    expect(listed.status).toBe(200);
    const skills = listed.body as Array<{ id: string; source: string; name: string }>;
    expect(skills.find((skill) => skill.id === created.id)).toMatchObject({
      id: created.id,
      name: validPayload.name,
      source: "custom",
    });
    expect(skills.find((skill) => skill.id === "stay-on-topic")).toMatchObject({
      source: "catalog",
    });

    await deleteCustomSkill(orgId, created.id);
  });
});
