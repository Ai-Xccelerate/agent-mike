import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import {
  markConnectionActive,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";
import { listSkillsForOrg } from "@/lib/tools-integrations/skills-catalog";
import type { SkillDefinition } from "@/lib/tools-integrations/skills-loader";
import { workerPatchSchema } from "@/lib/worker-patch";

const stayOnTopic: SkillDefinition = {
  id: "stay-on-topic",
  name: "stay-on-topic",
  description: "Stay on topic",
  requires: [],
  body: "# Stay on topic",
};

const needsCrm: SkillDefinition = {
  id: "needs-crm",
  name: "needs-crm",
  description: "Needs an active CRM connection",
  requires: ["crm"],
  body: "# Needs CRM",
};

describe("listSkillsForOrg gating", () => {
  it("marks empty requires as met and reflects enabledSkills", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    const listed = await listSkillsForOrg(orgId, ["stay-on-topic"], [stayOnTopic, needsCrm]);

    expect(listed).toEqual([
      {
        id: "stay-on-topic",
        name: "stay-on-topic",
        description: "Stay on topic",
        requires: [],
        requirementsMet: true,
        enabled: true,
        source: "catalog",
      },
      {
        id: "needs-crm",
        name: "needs-crm",
        description: "Needs an active CRM connection",
        requires: ["crm"],
        requirementsMet: false,
        enabled: false,
        source: "catalog",
      },
    ]);
  });

  it("requires an active connection for every listed integration type", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Skills gating org");

    const withoutConnection = await listSkillsForOrg(orgId, [], [needsCrm]);
    expect(withoutConnection[0]?.requirementsMet).toBe(false);

    const pending = await upsertPendingConnection({
      organizationId: orgId,
      integrationType: "crm",
      system: "zoho",
      composioAuthConfigId: "ac_zoho",
      connectedBy: "manager-1",
    });
    const stillPending = await listSkillsForOrg(orgId, [], [needsCrm]);
    expect(stillPending[0]?.requirementsMet).toBe(false);

    await markConnectionActive(pending.id, "ca_zoho_active");
    const active = await listSkillsForOrg(orgId, ["needs-crm"], [needsCrm]);
    expect(active[0]).toMatchObject({
      requirementsMet: true,
      enabled: true,
    });
  });
});

describe("PATCH enabledSkills persistence", () => {
  it("accepts enabledSkills on the worker patch schema and persists the array", async () => {
    const parsed = workerPatchSchema.safeParse({ enabledSkills: ["stay-on-topic"] });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Skills patch org");
    const [profile] = await db
      .insert(workerProfiles)
      .values({ organizationId: orgId, slug: `worker-${crypto.randomUUID()}` })
      .returning();

    await db
      .update(workerProfiles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(workerProfiles.id, profile.id));

    const [reloaded] = await db
      .select()
      .from(workerProfiles)
      .where(eq(workerProfiles.id, profile.id))
      .limit(1);
    expect(reloaded.enabledSkills).toEqual(["stay-on-topic"]);

    const catalog = await listSkillsForOrg(orgId, reloaded.enabledSkills ?? []);
    expect(catalog.find((skill) => skill.id === "stay-on-topic")).toMatchObject({
      requires: [],
      requirementsMet: true,
      enabled: true,
    });
  });
});
