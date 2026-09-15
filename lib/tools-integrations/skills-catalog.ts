import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { loadSkills, type SkillDefinition } from "@/lib/tools-integrations/skills-loader";

export type SkillCatalogItem = {
  id: string;
  name: string;
  description: string;
  requires: string[];
  requirementsMet: boolean;
  enabled: boolean;
};

async function requirementsMetFor(organizationId: string, requires: string[]): Promise<boolean> {
  if (requires.length === 0) return true;
  const connections = await Promise.all(
    requires.map((type) => getConnectionForOrg(organizationId, type)),
  );
  return connections.every((row) => row?.status === "active");
}

export async function listSkillsForOrg(
  organizationId: string,
  enabledSkills: string[],
  catalog: SkillDefinition[] = loadSkills(),
): Promise<SkillCatalogItem[]> {
  const enabled = new Set(enabledSkills);
  return Promise.all(
    catalog.map(async (skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      requires: skill.requires,
      requirementsMet: await requirementsMetFor(organizationId, skill.requires),
      enabled: enabled.has(skill.id),
    })),
  );
}
