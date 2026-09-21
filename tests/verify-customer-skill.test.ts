import { describe, expect, it } from "vitest";
import { ensureOrganization } from "@/lib/bootstrap";
import {
  markConnectionActive,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";
import {
  listActiveSkillsForOrg,
  VERIFY_CUSTOMER_SKILL_ID,
} from "@/lib/tools-integrations/skills-catalog";
import { getSkill } from "@/lib/tools-integrations/skills-loader";

describe("verify-customer built-in skill", () => {
  it("ships in the catalog gated on a CRM", () => {
    const skill = getSkill(VERIFY_CUSTOMER_SKILL_ID);
    expect(skill).toBeDefined();
    expect(skill?.requires).toEqual(["crm"]);
  });

  it("requires an exact address match and says what does not count as one", () => {
    const body = getSkill(VERIFY_CUSTOMER_SKILL_ID)?.body ?? "";
    expect(body).toContain("lookup_crm_contact");
    expect(body).toContain("character-for-character identical");
    // The whole point of the skill: a near miss is not a match, and knowing
    // the customer's name is not the same as being them.
    expect(body).toContain("A matching name.");
    expect(body).toContain("A matching phone number.");
  });

  it("is only active for an org once a CRM connection is actually live", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Verify customer gating org");
    const enabled = [VERIFY_CUSTOMER_SKILL_ID];

    expect(await listActiveSkillsForOrg(orgId, enabled)).toEqual([]);

    const pending = await upsertPendingConnection({
      organizationId: orgId,
      integrationType: "crm",
      system: "zoho",
      composioAuthConfigId: "ac_zoho",
      connectedBy: "manager-1",
    });
    // Pending is not connected — the OAuth round trip has not finished.
    expect(await listActiveSkillsForOrg(orgId, enabled)).toEqual([]);

    await markConnectionActive(pending.id, "ca_zoho_active");
    const active = await listActiveSkillsForOrg(orgId, enabled);
    expect(active.map((skill) => skill.id)).toContain(VERIFY_CUSTOMER_SKILL_ID);
  });
});
