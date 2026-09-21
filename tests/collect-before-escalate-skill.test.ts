import { describe, expect, it } from "vitest";
import { COLLECT_BEFORE_ESCALATE_SKILL_ID } from "@/lib/tools-integrations/skills-catalog";
import { getSkill, loadSkills } from "@/lib/tools-integrations/skills-loader";

describe("collect-before-escalate built-in skill", () => {
  it("ships in the catalog with no integration gate", () => {
    const skill = getSkill(COLLECT_BEFORE_ESCALATE_SKILL_ID);
    expect(skill).toBeDefined();
    expect(skill?.requires).toEqual([]);
    expect(skill?.name).toBe("Collect before escalate");
  });

  it("lists the required intake fields and the handoff summary shape", () => {
    const body = getSkill(COLLECT_BEFORE_ESCALATE_SKILL_ID)?.body ?? "";
    expect(body).toContain("Contact email");
    expect(body).toContain("Full name");
    expect(body).toContain("Handoff summary");
    expect(body).toContain("[[ESCALATE]]");
    expect(body).toContain("do not escalate on the first turn");
  });

  it("is discoverable via loadSkills", () => {
    expect(loadSkills().map((s) => s.id)).toContain(COLLECT_BEFORE_ESCALATE_SKILL_ID);
  });
});
