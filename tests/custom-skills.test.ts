import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customSkills } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import {
  createCustomSkill,
  deleteCustomSkill,
  getCustomSkill,
  listCustomSkills,
  updateCustomSkill,
} from "@/lib/tools-integrations/custom-skills-repository";
import { getSkillForOrg, listSkillsForOrg } from "@/lib/tools-integrations/skills-catalog";

async function seedOrg(label: string) {
  const orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, label);
  return orgId;
}

describe("custom skills repository", () => {
  it("creates, lists, updates, and deletes within one org", async () => {
    const orgId = await seedOrg("Custom skill owner");

    const created = await createCustomSkill({
      organizationId: orgId,
      name: "Escalate quietly",
      description: "When the customer is angry, keep the ticket factual.",
      requires: [],
      body: "# Escalate quietly\nDo not quote the rant.",
    });

    expect(created.organizationId).toBe(orgId);
    expect(created.name).toBe("Escalate quietly");
    expect(created.requires).toEqual([]);

    const listed = await listCustomSkills(orgId);
    expect(listed.map((row) => row.id)).toEqual([created.id]);

    const fetched = await getCustomSkill(orgId, created.id);
    expect(fetched?.body).toContain("Do not quote the rant");

    const updated = await updateCustomSkill(orgId, created.id, {
      name: "Escalate calmly",
      body: "# Escalate calmly\nKeep the summary short.",
    });
    expect(updated?.name).toBe("Escalate calmly");
    expect(updated?.body).toContain("Keep the summary short");
    expect(updated?.description).toBe("When the customer is angry, keep the ticket factual.");

    expect(await deleteCustomSkill(orgId, created.id)).toBe(true);
    expect(await getCustomSkill(orgId, created.id)).toBeNull();
    expect(await listCustomSkills(orgId)).toEqual([]);
  });

  it("scopes list/get/update/delete to the owning org", async () => {
    const orgA = await seedOrg("Custom skill org A");
    const orgB = await seedOrg("Custom skill org B");

    const skill = await createCustomSkill({
      organizationId: orgA,
      name: "Org A only",
      description: "Must not leak to org B",
      requires: ["crm"],
      body: "# Org A body",
    });

    expect(await listCustomSkills(orgB)).toEqual([]);
    expect(await getCustomSkill(orgB, skill.id)).toBeNull();

    const crossedUpdate = await updateCustomSkill(orgB, skill.id, { name: "Hijacked" });
    expect(crossedUpdate).toBeNull();
    expect((await getCustomSkill(orgA, skill.id))?.name).toBe("Org A only");

    expect(await deleteCustomSkill(orgB, skill.id)).toBe(false);
    expect(await getCustomSkill(orgA, skill.id)).not.toBeNull();

    expect(await deleteCustomSkill(orgA, skill.id)).toBe(true);
    await db.delete(customSkills).where(eq(customSkills.organizationId, orgA));
  });
});

describe("listSkillsForOrg catalog + custom merge", () => {
  it("returns stay-on-topic from the catalog and a custom skill with the right source", async () => {
    const orgId = await seedOrg("Merged catalog org");
    const custom = await createCustomSkill({
      organizationId: orgId,
      name: "Tone of voice",
      description: "Match the customer's formality.",
      requires: [],
      body: "# Tone\nMirror the latest message.",
    });

    const listed = await listSkillsForOrg(orgId, [custom.id, "stay-on-topic"]);
    const catalogSkill = listed.find((skill) => skill.id === "stay-on-topic");
    const customSkill = listed.find((skill) => skill.id === custom.id);

    expect(catalogSkill).toMatchObject({
      name: "stay-on-topic",
      source: "catalog",
      enabled: true,
      requirementsMet: true,
    });
    expect(customSkill).toMatchObject({
      name: "Tone of voice",
      description: "Match the customer's formality.",
      source: "custom",
      enabled: true,
      requirementsMet: true,
      requires: [],
    });

    await deleteCustomSkill(orgId, custom.id);
  });

  it("does not list another org's custom skill", async () => {
    const orgA = await seedOrg("Merge org A");
    const orgB = await seedOrg("Merge org B");
    const custom = await createCustomSkill({
      organizationId: orgA,
      name: "Private to A",
      description: "Org B must not see this",
      requires: [],
      body: "# Private",
    });

    const listedB = await listSkillsForOrg(orgB, [custom.id]);
    expect(listedB.find((skill) => skill.id === custom.id)).toBeUndefined();
    expect(listedB.find((skill) => skill.id === "stay-on-topic")).toMatchObject({
      source: "catalog",
      enabled: false,
    });

    await deleteCustomSkill(orgA, custom.id);
  });
});

describe("getSkillForOrg", () => {
  it("returns catalog skills and org-scoped custom skills", async () => {
    const orgA = await seedOrg("Lookup org A");
    const orgB = await seedOrg("Lookup org B");
    const custom = await createCustomSkill({
      organizationId: orgA,
      name: "Lookup custom",
      description: "Custom body for load_skill",
      requires: [],
      body: "# Custom lookup body",
    });

    const catalog = await getSkillForOrg(orgA, "stay-on-topic");
    expect(catalog?.id).toBe("stay-on-topic");
    expect(catalog?.body).toContain("Stay on topic");

    const own = await getSkillForOrg(orgA, custom.id);
    expect(own?.body).toBe("# Custom lookup body");

    expect(await getSkillForOrg(orgB, custom.id)).toBeNull();
    expect(await getSkillForOrg(orgA, "not-a-real-skill")).toBeNull();

    await deleteCustomSkill(orgA, custom.id);
  });
});
