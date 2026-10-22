// Copies one organization's worker configuration to another, over the public API, so a staging org can behave
// like the production org it stands in for (see docs/ORG-CLONE.md).
//
// What is copied: the worker's identity, role, tone, instructions, guardrails, skills (built-in on/off and the org's own
// custom skills) and knowledge articles. What is NOT copied, on purpose: anything that points at the outside world or at a
// person (slug, avatar, support email, the manager's email, integration connections and their settings), conversations,
// tickets, and anything a customer said. Those belong to the environment, and copying them could send real mail or leak
// real customer data into a test system.
//
// Pure functions plus a small API client, so the logic can be tested against a fake API.

/** Worker profile fields that make a worker behave the way it does. Everything else on the profile stays as it is. */
export const CLONED_PROFILE_FIELDS = [
  "name",
  "displayName",
  "avatarInitials",
  "accentColor",
  "bio",
  "timezone",
  "locale",
  "emailSignature",
  "tone",
  "role",
  "jobDescription",
  "systemPromptTemplate",
  "model",
  "maxAgentTurns",
  "confidenceThreshold",
  "escalationTerms",
  "allowedDomains",
  "requireUserVerification",
  "requireWriteApproval",
  "assistantActionsEnabled",
  "managerName",
  "autoReply",
  "firstReplyTargetHours",
  "toolsConfig",
  "channelsConfig",
  "ticketPrefix",
  "ticketSchema",
  "identityMode",
  "welcomeMessage",
  "quickActions",
];

/** Fields the importer never writes, even if a bundle carries them. Listed so a reviewer can see the line being held. */
export const NEVER_CLONED_PROFILE_FIELDS = [
  "slug",
  "email",
  "avatarUrl",
  "managerEmail",
  "integrationsConfig",
  "emailManagerOnHandoff",
  "restrictEmailDomains",
];

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * A client for one deployment. `token` is a manager's bearer token; `headers` is for anything else a deployment needs
 * (for example a local multi-agent header). The token is never logged.
 */
export function createClient({ api, token, headers = {}, fetchImpl = globalThis.fetch }) {
  const base = String(api).replace(/\/+$/, "");
  async function call(method, path, body) {
    const response = await fetchImpl(`${base}/api/v1${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!response.ok) {
      const detail = parsed && typeof parsed === "object" ? parsed.error || JSON.stringify(parsed.errors ?? parsed) : String(parsed ?? "");
      throw new ApiError(`${method} ${path} failed with ${response.status}${detail ? `: ${detail}` : ""}`, response.status, parsed);
    }
    return parsed;
  }
  return {
    api: base,
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    patch: (path, body) => call("PATCH", path, body),
  };
}

function pick(object, keys) {
  const out = {};
  for (const key of keys) if (key in object) out[key] = object[key];
  return out;
}

/** An article as the knowledge API wants it: the OKF frontmatter, so description, tags and resource survive. */
export function knowledgeToOkf(doc) {
  const lines = ["---", "type: reference", `title: ${JSON.stringify(doc.title)}`];
  if (doc.description) lines.push(`description: ${JSON.stringify(doc.description)}`);
  if (Array.isArray(doc.tags) && doc.tags.length > 0) lines.push(`tags: ${JSON.stringify(doc.tags)}`);
  if (doc.resource) lines.push(`resource: ${JSON.stringify(doc.resource)}`);
  lines.push("---", "", doc.body);
  return lines.join("\n");
}

/**
 * Reads everything cloneable from one org.
 * Custom skills carry their full text; built-in skills are just which ones are switched on.
 */
export async function exportOrg(client) {
  const [profile, skills, knowledge] = await Promise.all([client.get("/worker"), client.get("/skills"), client.get("/knowledge")]);

  const custom = [];
  for (const skill of skills.filter((entry) => entry.source === "custom")) {
    const full = await client.get(`/skills/${encodeURIComponent(skill.id)}`);
    custom.push({
      name: skill.name,
      description: skill.description,
      requires: skill.requires ?? [],
      body: full.body,
      enabled: Boolean(skill.enabled),
    });
  }
  const builtInEnabled = skills.filter((entry) => entry.source === "catalog" && entry.enabled).map((entry) => entry.id);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: { api: client.api, organizationName: profile.organizationName ?? null },
    profile: pick(profile, CLONED_PROFILE_FIELDS),
    builtInSkillsEnabled: builtInEnabled,
    customSkills: custom,
    knowledge: knowledge.map((doc) => ({
      conceptId: doc.conceptId,
      title: doc.title,
      description: doc.description ?? null,
      tags: doc.tags ?? [],
      resource: doc.resource ?? null,
      body: doc.body,
    })),
  };
}

/** A full copy of the target's profile and skills, written before anything changes so it can be put back. */
export async function backupOrg(client) {
  const [profile, skills] = await Promise.all([client.get("/worker"), client.get("/skills")]);
  return {
    version: 1,
    kind: "backup",
    takenAt: new Date().toISOString(),
    api: client.api,
    profile,
    enabledSkills: profile.enabledSkills ?? [],
    skills: skills.map((entry) => ({ id: entry.id, name: entry.name, source: entry.source, enabled: entry.enabled })),
  };
}

function changed(a, b) {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

/**
 * What an import would do to the target, without doing it.
 * `target` is { profile, skills, knowledge } as read from the target.
 */
export function planImport(bundle, target) {
  if (bundle?.version !== 1 || !bundle.profile) throw new Error("This is not an org export this script understands (version 1).");

  const targetCustomByName = new Map(target.skills.filter((s) => s.source === "custom").map((s) => [s.name, s]));
  const targetCatalogIds = new Set(target.skills.filter((s) => s.source === "catalog").map((s) => s.id));
  const knowledgeById = new Map(target.knowledge.map((doc) => [doc.conceptId, doc]));

  const profileChanges = {};
  for (const field of CLONED_PROFILE_FIELDS) {
    if (!(field in bundle.profile)) continue;
    if (changed(bundle.profile[field], target.profile[field])) profileChanges[field] = { from: target.profile[field] ?? null, to: bundle.profile[field] };
  }

  const customSkills = bundle.customSkills.map((skill) => {
    const existing = targetCustomByName.get(skill.name);
    if (!existing) return { action: "create", skill };
    return { action: "update", skill, id: existing.id };
  });

  const skippedBuiltIns = bundle.builtInSkillsEnabled.filter((id) => !targetCatalogIds.has(id));
  const builtIns = bundle.builtInSkillsEnabled.filter((id) => targetCatalogIds.has(id));

  const knowledge = bundle.knowledge.map((doc) => {
    const existing = knowledgeById.get(doc.conceptId);
    if (!existing) return { action: "create", doc };
    return existing.body === doc.body && existing.title === doc.title ? { action: "same", doc } : { action: "update", doc };
  });
  const extraOnTarget = target.knowledge.filter((doc) => !bundle.knowledge.some((entry) => entry.conceptId === doc.conceptId)).map((doc) => doc.conceptId);

  return { profileChanges, customSkills, builtIns, skippedBuiltIns, knowledge, extraOnTarget };
}

export async function readTarget(client) {
  const [profile, skills, knowledge] = await Promise.all([client.get("/worker"), client.get("/skills"), client.get("/knowledge")]);
  return { profile, skills, knowledge };
}

/** One readable line per change, for the dry run and the log. */
export function describePlan(plan) {
  const lines = [];
  const fields = Object.keys(plan.profileChanges);
  lines.push(`Profile: ${fields.length === 0 ? "already matches" : `${fields.length} field(s) change: ${fields.join(", ")}`}`);
  for (const entry of plan.customSkills) lines.push(`Skill "${entry.skill.name}": ${entry.action}${entry.skill.enabled ? " (on)" : " (off)"}`);
  lines.push(`Built-in skills on: ${plan.builtIns.join(", ") || "none"}${plan.skippedBuiltIns.length ? `; not in target's catalog, skipped: ${plan.skippedBuiltIns.join(", ")}` : ""}`);
  const counts = { create: 0, update: 0, same: 0 };
  for (const entry of plan.knowledge) counts[entry.action] += 1;
  lines.push(`Knowledge: ${counts.create} new, ${counts.update} updated, ${counts.same} unchanged${plan.extraOnTarget.length ? `; ${plan.extraOnTarget.length} on the target but not in the export are left alone` : ""}`);
  return lines;
}

/**
 * Applies a plan. Order matters: custom skills first (their ids are needed to switch them on), then the profile (which
 * also switches skills on), then knowledge. Nothing is ever deleted.
 */
export async function applyPlan(client, bundle, plan, log = () => undefined) {
  const idByName = new Map();
  for (const entry of plan.customSkills) {
    const payload = { name: entry.skill.name, description: entry.skill.description, requires: entry.skill.requires, body: entry.skill.body };
    if (entry.action === "update") {
      await client.patch(`/skills/custom/${encodeURIComponent(entry.id)}`, payload);
      idByName.set(entry.skill.name, entry.id);
    } else {
      const created = await client.post("/skills/custom", payload);
      idByName.set(entry.skill.name, created.id);
    }
    log(`skill ${entry.action}d: ${entry.skill.name}`);
  }

  const enabledSkills = [...plan.builtIns, ...bundle.customSkills.filter((skill) => skill.enabled).map((skill) => idByName.get(skill.name))].filter(Boolean);
  const patch = Object.fromEntries(Object.entries(plan.profileChanges).map(([field, change]) => [field, change.to]));
  patch.enabledSkills = enabledSkills;
  await client.patch("/worker", patch);
  log(`profile updated (${Object.keys(plan.profileChanges).length} field(s), ${enabledSkills.length} skill(s) on)`);

  for (const entry of plan.knowledge) {
    if (entry.action === "same") continue;
    await client.post("/knowledge", { conceptId: entry.doc.conceptId, isOkf: true, content: knowledgeToOkf(entry.doc) });
    log(`knowledge ${entry.action}d: ${entry.doc.conceptId}`);
  }
}

/** Puts a backup's profile fields (and which skills were on) back. Skills and knowledge added by an import are left in place. */
export async function restoreBackup(client, backup) {
  if (backup?.kind !== "backup") throw new Error("This is not a backup file written by this script.");
  const patch = pick(backup.profile, CLONED_PROFILE_FIELDS);
  patch.enabledSkills = backup.enabledSkills ?? [];
  await client.patch("/worker", patch);
}
