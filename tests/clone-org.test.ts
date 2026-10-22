/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { GET as getWorker, PATCH as patchWorker } from "@/app/api/v1/worker/route";
import { GET as getSkills } from "@/app/api/v1/skills/route";
import { GET as getSkill } from "@/app/api/v1/skills/[id]/route";
import { POST as postCustomSkill } from "@/app/api/v1/skills/custom/route";
import { PATCH as patchCustomSkill } from "@/app/api/v1/skills/custom/[id]/route";
import { GET as getKnowledge, POST as postKnowledge } from "@/app/api/v1/knowledge/route";
import {
  ApiError,
  applyPlan,
  backupOrg,
  CLONED_PROFILE_FIELDS,
  createClient,
  exportOrg,
  knowledgeToOkf,
  NEVER_CLONED_PROFILE_FIELDS,
  planImport,
  readTarget,
  restoreBackup,
} from "../scripts/clone-org-lib.mjs";

// The clone runs over HTTP; here "HTTP" is the real route handlers, so what is checked is the real validation, with the
// organization picked by a header the same way a token would pick it.
const previousAdapter = getIdentityAdapter();
const adapter: IdentityAdapter = {
  resolveManagerRequest: async (req) => ({ orgId: req.headers.get("x-test-org") ?? "none", userId: "m", role: "owner", source: "test" }),
  resolveWidgetRequest: async () => null,
};

async function route(method: string, path: string, req: NextRequest) {
  const parts = path.split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (a === "worker") return method === "GET" ? getWorker(req) : patchWorker(req);
  if (a === "skills" && !b) return getSkills(req);
  if (a === "skills" && b === "custom" && !c) return postCustomSkill(req);
  if (a === "skills" && b === "custom") return patchCustomSkill(req, { params: { id: decodeURIComponent(c) } });
  if (a === "skills") return getSkill(req, { params: { id: decodeURIComponent(b) } });
  if (a === "knowledge") return method === "GET" ? getKnowledge(req) : postKnowledge(req);
  throw new Error(`no handler for ${method} ${path}`);
}

function clientFor(orgId: string) {
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = url.replace("http://test/api/v1", "");
    const req = new NextRequest(url, { ...init, headers: { ...(init.headers as Record<string, string>), "x-test-org": orgId }, duplex: "half" } as any);
    return route(init.method ?? "GET", path, req);
  }) as unknown as typeof fetch;
  return createClient({ api: "http://test", token: "t", fetchImpl });
}

let source: string;
let target: string;

async function seedSource() {
  const profile = await getOrCreateProfile(source);
  await db
    .update(workerProfiles)
    .set({
      name: "Eva L1",
      displayName: "Eva",
      role: "First-line support for EAP Expert.",
      tone: "Calm and clear.",
      jobDescription: "Always hand over bugs.",
      systemPromptTemplate: "Answer only from the knowledge base.",
      escalationTerms: ["outage", "data breach"],
      confidenceThreshold: 0.75,
      maxAgentTurns: 4,
      timezone: "America/Toronto",
      emailSignature: "Eva, EAP Expert Support",
      ticketPrefix: "EAP",
      identityMode: "email_match",
      welcomeMessage: "Hi, I'm {name}.",
      quickActions: ["Report a bug"],
      // Things that belong to the environment, and must stay where they are.
      slug: "eva-source",
      email: "support@eap.example",
      managerEmail: "support-team@eap.example",
      enabledSkills: ["collect-before-escalate"],
    })
    .where(eq(workerProfiles.id, profile.id));

  const client = clientFor(source);
  const created = await client.post("/skills/custom", { name: "Judge the priority", description: "Use for bugs.", requires: [], body: "# Judge the priority\nCritical means nobody can work." });
  await client.post("/skills/custom", { name: "Off skill", description: "Stays off.", requires: [], body: "# Off\nnothing" });
  await client.patch("/worker", { enabledSkills: ["collect-before-escalate", created.id] });
  await client.post("/knowledge", {
    conceptId: "priorities",
    isOkf: true,
    content: knowledgeToOkf({ title: "Priorities", description: "What each priority means", tags: ["priority", "procedure"], body: "Critical: the system is down." }),
  });
  await client.post("/knowledge", { conceptId: "privacy", title: "Privacy", content: "Never repeat client details." });
}

beforeEach(async () => {
  setIdentityAdapter(adapter);
  source = `clone-src-${crypto.randomUUID()}`;
  target = `clone-dst-${crypto.randomUUID()}`;
  await ensureOrganization(source, source);
  await ensureOrganization(target, target);
  await getOrCreateProfile(target);
  await db
    .update(workerProfiles)
    .set({ slug: "staging-eva", email: "staging@example.test", managerEmail: "charan@example.test", displayName: "Mike", role: "Old role" })
    .where(eq(workerProfiles.organizationId, target));
  await seedSource();
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  await db.delete(organizations).where(eq(organizations.id, source));
  await db.delete(organizations).where(eq(organizations.id, target));
});

async function importInto(targetClient: ReturnType<typeof clientFor>, bundle: any) {
  const plan = planImport(bundle, await readTarget(targetClient));
  await applyPlan(targetClient, bundle, plan);
  return plan;
}

describe("exporting an org", () => {
  it("carries the worker's behaviour and nothing that points at the outside world", async () => {
    const bundle = await exportOrg(clientFor(source));

    expect(bundle.profile).toMatchObject({ displayName: "Eva", role: "First-line support for EAP Expert.", escalationTerms: ["outage", "data breach"], identityMode: "email_match" });
    for (const field of NEVER_CLONED_PROFILE_FIELDS) expect(bundle.profile).not.toHaveProperty(field);
    expect(JSON.stringify(bundle)).not.toContain("support-team@eap.example");
    expect(bundle.customSkills.map((s: any) => [s.name, s.enabled])).toEqual(expect.arrayContaining([["Judge the priority", true], ["Off skill", false]]));
    expect(bundle.customSkills.find((s: any) => s.name === "Judge the priority").body).toContain("Critical means nobody can work");
    expect(bundle.builtInSkillsEnabled).toEqual(["collect-before-escalate"]);
    expect(bundle.knowledge.map((k: any) => k.conceptId).sort()).toEqual(["priorities", "privacy"]);
    expect(Object.keys(bundle)).not.toContain("conversations");
  });

  it("only ever lists fields it has chosen to copy", () => {
    for (const field of NEVER_CLONED_PROFILE_FIELDS) expect(CLONED_PROFILE_FIELDS).not.toContain(field);
  });
});

describe("importing into another org", () => {
  it("makes the target behave like the source, and leaves what is the environment's alone", async () => {
    const bundle = await exportOrg(clientFor(source));
    const targetClient = clientFor(target);

    await importInto(targetClient, bundle);

    const copied = await targetClient.get("/worker");
    for (const field of CLONED_PROFILE_FIELDS) expect(copied[field], field).toEqual(bundle.profile[field]);
    // The environment's own values survive.
    expect(copied).toMatchObject({ slug: "staging-eva", email: "staging@example.test", managerEmail: "charan@example.test" });

    const skills = await targetClient.get("/skills");
    const custom = skills.filter((s: any) => s.source === "custom");
    expect(custom.map((s: any) => s.name).sort()).toEqual(["Judge the priority", "Off skill"]);
    const judge = custom.find((s: any) => s.name === "Judge the priority");
    expect(copied.enabledSkills.sort()).toEqual(["collect-before-escalate", judge.id].sort());
    expect((await targetClient.get(`/skills/${judge.id}`)).body).toContain("Critical means nobody can work");

    const knowledge = await targetClient.get("/knowledge");
    const priorities = knowledge.find((k: any) => k.conceptId === "priorities");
    expect(priorities).toMatchObject({ title: "Priorities", description: "What each priority means", tags: ["priority", "procedure"] });
    expect(priorities.body).toContain("Critical: the system is down.");
  });

  it("is safe to run twice: nothing is duplicated and the second plan has nothing to do", async () => {
    const bundle = await exportOrg(clientFor(source));
    const targetClient = clientFor(target);
    await importInto(targetClient, bundle);

    const second = planImport(bundle, await readTarget(targetClient));
    expect(second.profileChanges).toEqual({});
    expect(second.customSkills.every((entry: any) => entry.action === "update")).toBe(true);
    expect(second.knowledge.every((entry: any) => entry.action === "same")).toBe(true);

    await applyPlan(targetClient, bundle, second);
    const skills = await targetClient.get("/skills");
    expect(skills.filter((s: any) => s.source === "custom")).toHaveLength(2);
    expect(await targetClient.get("/knowledge")).toHaveLength(2);
  });

  it("changes nothing when it only plans", async () => {
    const bundle = await exportOrg(clientFor(source));
    const targetClient = clientFor(target);
    const before = await targetClient.get("/worker");

    const plan = planImport(bundle, await readTarget(targetClient));

    expect(Object.keys(plan.profileChanges)).toContain("role");
    expect(plan.customSkills.map((entry: any) => entry.action)).toEqual(["create", "create"]);
    expect(await targetClient.get("/worker")).toEqual(before);
    expect(await targetClient.get("/knowledge")).toEqual([]);
  });

  it("leaves target articles that are not in the export, and says so", async () => {
    const targetClient = clientFor(target);
    await targetClient.post("/knowledge", { conceptId: "only-here", title: "Only here", content: "kept" });
    const bundle = await exportOrg(clientFor(source));

    const plan = planImport(bundle, await readTarget(targetClient));
    await applyPlan(targetClient, bundle, plan);

    expect(plan.extraOnTarget).toEqual(["only-here"]);
    expect((await targetClient.get("/knowledge")).map((k: any) => k.conceptId)).toContain("only-here");
  });

  it("skips a built-in skill the target does not have", async () => {
    const bundle = await exportOrg(clientFor(source));
    bundle.builtInSkillsEnabled.push("a-skill-from-the-future");

    const plan = planImport(bundle, await readTarget(clientFor(target)));

    expect(plan.skippedBuiltIns).toEqual(["a-skill-from-the-future"]);
    expect(plan.builtIns).toEqual(["collect-before-escalate"]);
  });

  it("refuses a file it does not understand", async () => {
    expect(() => planImport({ version: 2 }, { profile: {}, skills: [], knowledge: [] })).toThrow(/not an org export/);
  });

  it("reports the API's reason when a value is refused", async () => {
    const bundle = await exportOrg(clientFor(source));
    bundle.profile.quickActions = ["x".repeat(41)];
    const targetClient = clientFor(target);

    await expect(importInto(targetClient, bundle)).rejects.toThrow(ApiError);
    await expect(importInto(targetClient, bundle)).rejects.toThrow(/PATCH \/worker failed with 422/);
  });
});

describe("backup and restore", () => {
  it("puts the target's settings back after an import", async () => {
    const targetClient = clientFor(target);
    const before = await targetClient.get("/worker");
    const backup = await backupOrg(targetClient);
    const bundle = await exportOrg(clientFor(source));
    await importInto(targetClient, bundle);
    expect((await targetClient.get("/worker")).role).toBe("First-line support for EAP Expert.");

    await restoreBackup(targetClient, backup);

    const after = await targetClient.get("/worker");
    for (const field of CLONED_PROFILE_FIELDS) expect(after[field], field).toEqual(before[field]);
    expect(after.enabledSkills).toEqual(before.enabledSkills);
  });

  it("will not restore from a file that is not a backup", async () => {
    await expect(restoreBackup(clientFor(target), { version: 1 })).rejects.toThrow(/not a backup/);
  });
});
