import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import matter from "gray-matter";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  requires: string[];
  body: string;
}

export function skillsDirectory(): string {
  return path.join(process.cwd(), "skills");
}

function asRequiredString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseSkillFile(skillFile: string, id: string): SkillDefinition {
  const raw = readFileSync(skillFile, "utf8");
  const { data, content } = matter(raw);
  const name = asRequiredString(data.name);
  const description = asRequiredString(data.description);
  if (!name) {
    throw new Error(`Skill file "${skillFile}" is missing required frontmatter field "name"`);
  }
  if (!description) {
    throw new Error(`Skill file "${skillFile}" is missing required frontmatter field "description"`);
  }
  const requires = Array.isArray(data.requires)
    ? data.requires.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    id,
    name,
    description,
    requires,
    body: content.trim(),
  };
}

export function loadSkills(skillsDir = skillsDirectory()): SkillDefinition[] {
  if (!existsSync(skillsDir)) return [];
  const skills: SkillDefinition[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    skills.push(parseSkillFile(skillFile, entry.name));
  }
  return skills;
}

export function getSkill(id: string, skillsDir = skillsDirectory()): SkillDefinition | undefined {
  return loadSkills(skillsDir).find((skill) => skill.id === id);
}
