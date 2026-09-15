import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { getCustomSkill, listCustomSkills } from "@/lib/tools-integrations/custom-skills-repository";
import { getSkill, loadSkills, type SkillDefinition } from "@/lib/tools-integrations/skills-loader";

export type SkillSource = "catalog" | "custom";

export type SkillCatalogItem = {
  id: string;
  name: string;
  description: string;
  requires: string[];
  requirementsMet: boolean;
  enabled: boolean;
  source: SkillSource;
};

async function requirementsMetFor(organizationId: string, requires: string[]): Promise<boolean> {
  if (requires.length === 0) return true;
  const connections = await Promise.all(
    requires.map((type) => getConnectionForOrg(organizationId, type)),
  );
  return connections.every((row) => row?.status === "active");
}

async function toCatalogItem(
  organizationId: string,
  enabled: Set<string>,
  skill: { id: string; name: string; description: string; requires: string[] },
  source: SkillSource,
): Promise<SkillCatalogItem> {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    requires: skill.requires,
    requirementsMet: await requirementsMetFor(organizationId, skill.requires),
    enabled: enabled.has(skill.id),
    source,
  };
}

export async function listSkillsForOrg(
  organizationId: string,
  enabledSkills: string[],
  catalog: SkillDefinition[] = loadSkills(),
): Promise<SkillCatalogItem[]> {
  const enabled = new Set(enabledSkills);
  const custom = await listCustomSkills(organizationId);
  const catalogItems = await Promise.all(
    catalog.map((skill) => toCatalogItem(organizationId, enabled, skill, "catalog")),
  );
  const customItems = await Promise.all(
    custom.map((skill) => toCatalogItem(organizationId, enabled, skill, "custom")),
  );
  return [...catalogItems, ...customItems];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Catalog first (disk), then this org's custom skills.
 */
export async function getSkillForOrg(
  organizationId: string,
  id: string,
): Promise<SkillDefinition | null> {
  const catalog = getSkill(id);
  if (catalog) return catalog;
  if (!UUID_RE.test(id)) return null;
  const custom = await getCustomSkill(organizationId, id);
  if (!custom) return null;
  return {
    id: custom.id,
    name: custom.name,
    description: custom.description,
    requires: custom.requires,
    body: custom.body,
  };
}
