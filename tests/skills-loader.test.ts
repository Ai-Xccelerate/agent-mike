import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { getSkill, loadSkills } from "@/lib/tools-integrations/skills-loader";

const STAY_ON_TOPIC_DESCRIPTION =
  "Use when a conversation drifts off-topic before a ticket gets created, so the ticket only captures what's actually relevant to the reported issue.";

describe("skills loader", () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) {
      rmSync(fixtureDir, { recursive: true, force: true });
      fixtureDir = undefined;
    }
  });

  it("loads the stay-on-topic catalog skill with name, description, requires, and body", () => {
    const skills = loadSkills();
    const stayOnTopic = skills.find((skill) => skill.id === "stay-on-topic");
    expect(stayOnTopic).toMatchObject({
      id: "stay-on-topic",
      name: "stay-on-topic",
      description: STAY_ON_TOPIC_DESCRIPTION,
      requires: [],
    });
    expect(stayOnTopic?.body).toContain("# Stay on topic");
    expect(stayOnTopic?.body).toContain("Omit small talk, unrelated tangents");
  });

  it("looks up a catalog skill by directory id and returns undefined for unknown ids", () => {
    expect(getSkill("stay-on-topic")?.id).toBe("stay-on-topic");
    expect(getSkill("stay-on-topic")?.name).toBe("stay-on-topic");
    expect(getSkill("not-a-real-skill")).toBeUndefined();
  });

  it("throws a clear error naming the file when description frontmatter is missing", () => {
    fixtureDir = mkdtempSync(path.join(os.tmpdir(), "ai-worker-skills-"));
    const badDir = path.join(fixtureDir, "broken-skill");
    mkdirSync(badDir);
    const badFile = path.join(badDir, "SKILL.md");
    writeFileSync(
      badFile,
      "---\nname: broken-skill\nrequires: []\n---\n\n# Broken\n",
      "utf8",
    );

    expect(() => loadSkills(fixtureDir)).toThrow(/description/i);
    expect(() => loadSkills(fixtureDir)).toThrow(badFile);
  });
});
