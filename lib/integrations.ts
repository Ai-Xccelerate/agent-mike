import { z } from "zod";
import { isParchmentConfigured, parchmentApiUrl, parchmentOrgId } from "@/lib/parchment";
import { agentDbApiUrl, agentDbOrgId, hasEnableJwt, isAgentDbConfigured } from "@/lib/agentdb";
import { isScribeConfigured, scribeMcpUrl } from "@/lib/scribe";
import { artifactsMcpUrl, artifactsOrgLabel, isArtifactsConfigured } from "@/lib/artifacts";
import { agentWikiKeyLabel, agentWikiMcpUrl, isAgentWikiConfigured } from "@/lib/agent-wiki";
import {
  SKILLS_PROVIDER,
  SKILLS_REQUIRED_FIELDS,
  envSkillsCredentials,
  resolveSkillsCredentials,
} from "@/lib/skills-repository";
import { describeCredentials, type CredentialSummary } from "@/lib/provider-credentials";

/**
 * Settings > Integrations.
 *
 * An integration is an externally-connected system (R6): the Foundation talks
 * to it over its own API and never bakes it into the harness. State lives in
 * `worker_profiles.integrations_config` so adding one is configuration, not a
 * schema migration per integration.
 *
 * Two different things decide whether an integration actually runs:
 *
 *   available — the server holds the credentials for it (env). Not user-editable.
 *   enabled   — the worker's own toggle. User-editable.
 *
 * Both must be true. `available` false always wins, so a deployment without
 * credentials never calls out, whatever the toggle says.
 */

export const PARCHMENT_KEY = "parchment";

export const parchmentSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Specific workspace, or null for the org's default (per the doc). */
  workspaceId: z.string().min(1).nullable(),
  /** Overrides the org id sent as X-Clerk-Org-Id. Null = env, then local org id. */
  orgId: z.string().min(1).nullable(),
});

export type ParchmentSettings = z.infer<typeof parchmentSettingsSchema>;

/**
 * Parchment access is default-allow once the server is configured — the
 * integration doc is explicit that gating it behind an opt-in toggle would
 * gate something that is not actually gated. So the toggle defaults to on and
 * functions as an opt-out ("stop grounding this worker in Parchment").
 */
export function parchmentDefaults(): ParchmentSettings {
  return { enabled: true, workspaceId: null, orgId: null };
}

export const AGENTDB_KEY = "agentdb";

/** Same shape as Parchment's — both speak the AIX Core internal-agent path. */
export const agentDbSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Specific workspace, or null for the org's Default (oldest) workspace. */
  workspaceId: z.string().min(1).nullable(),
  /** Overrides the org id sent as X-Clerk-Org-Id. Null = env, then local org id. */
  orgId: z.string().min(1).nullable(),
});

export type AgentDbSettings = z.infer<typeof agentDbSettingsSchema>;

/**
 * AgentDB defaults to *off*, unlike Parchment.
 *
 * The internal path's scope is always full — SQL/DML/DDL, files, screens — so
 * the same blast radius as a Connect "full" key. Connecting a worker to the
 * org's live database is an opt-IN decision a manager makes deliberately, not
 * something that starts switched on because credentials happen to be present.
 */
export function agentDbDefaults(): AgentDbSettings {
  return { enabled: false, workspaceId: null, orgId: null };
}

export const SCRIBE_KEY = "scribe";

export const scribeSettingsSchema = z.object({
  enabled: z.boolean(),
  /**
   * How far back meeting evidence may be drawn from. Null = the whole corpus.
   * Bounded rather than free-form because "no older than N days" is the only
   * limit Scribe's own API accepts, and a stale meeting is a common way for a
   * worker to answer confidently and wrongly.
   */
  lookbackDays: z.number().int().min(1).max(3650).nullable(),
});

export type ScribeSettings = z.infer<typeof scribeSettingsSchema>;

/**
 * Scribe defaults to *off*, like AgentDB and unlike Parchment.
 *
 * Every Scribe tool is read-only, so the risk here is not mutation — it is
 * disclosure. Meeting transcripts are internal talk: pricing strategy, staff,
 * half-formed decisions. Grounding a customer-facing worker in them is a
 * deliberate choice a manager makes, not a default that arrives switched on
 * because a token happens to be set.
 */
export function scribeDefaults(): ScribeSettings {
  return { enabled: false, lookbackDays: null };
}


export const ARTIFACTS_KEY = "artifacts";

export const artifactsSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Brand kit to build with, or null for the workspace's default kit. */
  brandKitId: z.string().min(1).nullable(),
  /**
   * Whether the worker may put an artifact in front of someone outside the
   * workspace (publish to a live URL, or deliver over a channel). Separate
   * from `enabled` because "draft me a deck" and "publish it to the web" are
   * very different amounts of trust, and only one of them is reversible.
   */
  allowPublish: z.boolean(),
});

export type ArtifactsSettings = z.infer<typeof artifactsSettingsSchema>;

/**
 * Agent Artifacts defaults to off, and to draft-only when switched on.
 *
 * It is the only write-capable integration here: it creates artifacts that
 * belong to the workspace and count against its quota, and can publish them to
 * a public URL. Both of those are opt-in, separately.
 */
export function artifactsDefaults(): ArtifactsSettings {
  return { enabled: false, brandKitId: null, allowPublish: false };
}

export const AGENT_WIKI_KEY = "agent_wiki";

export const agentWikiSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Restrict the worker to one space, or null for every space the key reaches. */
  spaceId: z.string().min(1).nullable(),
  /**
   * Whether the worker may change pages, rather than only read and search them.
   *
   * This never grants anything. Agent Wiki issues a key against the person who
   * created it and refuses a write the key was not given permission for,
   * whatever is set here — so this is a second brake the manager controls, on
   * top of the one the key already carries.
   */
  allowWrite: z.boolean(),
});

export type AgentWikiSettings = z.infer<typeof agentWikiSettingsSchema>;

/**
 * Agent Wiki defaults to off, and to read-only when switched on.
 *
 * A wiki is the organization's own writing about itself, so reading it is
 * close to Parchment in spirit — but unlike Parchment this integration can
 * also rename, move and delete pages, and a page deleted by a worker is not
 * obviously recoverable by the manager who let it. So the capability arrives
 * switched off, and writing is a separate decision from using it at all.
 */
export function agentWikiDefaults(): AgentWikiSettings {
  return { enabled: false, spaceId: null, allowWrite: false };
}

export const AGENT_SKILLS_KEY = "agent_skills";

export const agentSkillsSettingsSchema = z.object({
  enabled: z.boolean(),
  /**
   * Restrict discovery to one category, or null for the whole repository.
   *
   * Unlike the catalog and custom skills, repository skills are not enabled
   * one by one — the point of the repository is that the worker can find a
   * skill nobody thought to switch on in advance. A category is the only
   * scope that does not defeat that.
   */
  category: z.string().min(1).nullable(),
  /** How many candidates a search may pull back before the worker chooses. */
  maxResults: z.number().int().min(1).max(20),
});

export type AgentSkillsSettings = z.infer<typeof agentSkillsSettingsSchema>;

/**
 * Off by default, like every integration that reaches outside the deployment.
 *
 * Nothing here is write-capable — the key can only search and load published
 * skills — so the risk is not damage. It is that every search and load is
 * logged upstream against this key, including the ones that come back empty.
 * That is somebody else's visibility into how this worker works, and worth a
 * deliberate yes.
 */
export function agentSkillsDefaults(): AgentSkillsSettings {
  return { enabled: false, category: null, maxResults: 5 };
}

export const integrationsConfigSchema = z.object({
  [PARCHMENT_KEY]: parchmentSettingsSchema,
  [AGENTDB_KEY]: agentDbSettingsSchema,
  [SCRIBE_KEY]: scribeSettingsSchema,
  [ARTIFACTS_KEY]: artifactsSettingsSchema,
  [AGENT_WIKI_KEY]: agentWikiSettingsSchema,
  [AGENT_SKILLS_KEY]: agentSkillsSettingsSchema,
});

export type IntegrationsConfig = z.infer<typeof integrationsConfigSchema>;

/** PATCH bodies may send only the keys they are changing. */
export const parchmentPatchSchema = parchmentSettingsSchema.partial().strict();
export const agentDbPatchSchema = agentDbSettingsSchema.partial().strict();
export const scribePatchSchema = scribeSettingsSchema.partial().strict();
export const artifactsPatchSchema = artifactsSettingsSchema.partial().strict();
export const agentWikiPatchSchema = agentWikiSettingsSchema.partial().strict();
export const agentSkillsPatchSchema = agentSkillsSettingsSchema.partial().strict();

export function integrationsDefaults(): IntegrationsConfig {
  return {
    [PARCHMENT_KEY]: parchmentDefaults(),
    [AGENTDB_KEY]: agentDbDefaults(),
    [SCRIBE_KEY]: scribeDefaults(),
    [ARTIFACTS_KEY]: artifactsDefaults(),
    [AGENT_WIKI_KEY]: agentWikiDefaults(),
    [AGENT_SKILLS_KEY]: agentSkillsDefaults(),
  };
}

/** One integration's slice, defaulted and validated independently of the rest. */
function readSlice<T>(
  stored: unknown,
  key: string,
  schema: z.ZodType<T>,
  defaults: T,
): T {
  if (!stored || typeof stored !== "object") return defaults;
  const raw = (stored as Record<string, unknown>)[key];
  if (!raw || typeof raw !== "object") return defaults;
  const parsed = schema.safeParse({ ...defaults, ...(raw as object) });
  return parsed.success ? parsed.data : defaults;
}

/**
 * Rows written before a field existed, or hand-edited JSON, must not take the
 * settings screen down — anything that fails to validate falls back to the
 * default for that integration. Each integration is read separately so one
 * corrupt slice cannot reset the others.
 */
export function readIntegrations(stored: unknown): IntegrationsConfig {
  const defaults = integrationsDefaults();
  return {
    [PARCHMENT_KEY]: readSlice(stored, PARCHMENT_KEY, parchmentSettingsSchema, defaults[PARCHMENT_KEY]),
    [AGENTDB_KEY]: readSlice(stored, AGENTDB_KEY, agentDbSettingsSchema, defaults[AGENTDB_KEY]),
    [SCRIBE_KEY]: readSlice(stored, SCRIBE_KEY, scribeSettingsSchema, defaults[SCRIBE_KEY]),
    [ARTIFACTS_KEY]: readSlice(stored, ARTIFACTS_KEY, artifactsSettingsSchema, defaults[ARTIFACTS_KEY]),
    [AGENT_WIKI_KEY]: readSlice(stored, AGENT_WIKI_KEY, agentWikiSettingsSchema, defaults[AGENT_WIKI_KEY]),
    [AGENT_SKILLS_KEY]: readSlice(stored, AGENT_SKILLS_KEY, agentSkillsSettingsSchema, defaults[AGENT_SKILLS_KEY]),
  };
}

export function readParchmentSettings(stored: unknown): ParchmentSettings {
  return readIntegrations(stored)[PARCHMENT_KEY];
}

export function readAgentDbSettings(stored: unknown): AgentDbSettings {
  return readIntegrations(stored)[AGENTDB_KEY];
}

/** Merges a validated patch over current settings, preserving untouched keys. */
export function mergeParchmentSettings(
  stored: unknown,
  patch: Partial<ParchmentSettings>,
): IntegrationsConfig {
  const current = readIntegrations(stored);
  return { ...current, [PARCHMENT_KEY]: { ...current[PARCHMENT_KEY], ...patch } };
}

export function mergeAgentDbSettings(
  stored: unknown,
  patch: Partial<AgentDbSettings>,
): IntegrationsConfig {
  const current = readIntegrations(stored);
  return { ...current, [AGENTDB_KEY]: { ...current[AGENTDB_KEY], ...patch } };
}

export function readScribeSettings(stored: unknown): ScribeSettings {
  return readIntegrations(stored)[SCRIBE_KEY];
}

export function mergeScribeSettings(
  stored: unknown,
  patch: Partial<ScribeSettings>,
): IntegrationsConfig {
  const current = readIntegrations(stored);
  return { ...current, [SCRIBE_KEY]: { ...current[SCRIBE_KEY], ...patch } };
}


export function readArtifactsSettings(stored: unknown): ArtifactsSettings {
  return readIntegrations(stored)[ARTIFACTS_KEY];
}

export function mergeArtifactsSettings(
  stored: unknown,
  patch: Partial<ArtifactsSettings>,
): IntegrationsConfig {
  const current = readIntegrations(stored);
  return { ...current, [ARTIFACTS_KEY]: { ...current[ARTIFACTS_KEY], ...patch } };
}

export function readAgentWikiSettings(stored: unknown): AgentWikiSettings {
  return readIntegrations(stored)[AGENT_WIKI_KEY];
}

export function mergeAgentWikiSettings(
  stored: unknown,
  patch: Partial<AgentWikiSettings>,
): IntegrationsConfig {
  const current = readIntegrations(stored);
  return { ...current, [AGENT_WIKI_KEY]: { ...current[AGENT_WIKI_KEY], ...patch } };
}

export function readAgentSkillsSettings(stored: unknown): AgentSkillsSettings {
  return readIntegrations(stored)[AGENT_SKILLS_KEY];
}

export function mergeAgentSkillsSettings(
  stored: unknown,
  patch: Partial<AgentSkillsSettings>,
): IntegrationsConfig {
  const current = readIntegrations(stored);
  return { ...current, [AGENT_SKILLS_KEY]: { ...current[AGENT_SKILLS_KEY], ...patch } };
}

/**
 * Switches one internal tool on or off with that tool's own merge helper, so
 * its other settings (workspace, lookback window, write/publish permission)
 * are preserved exactly as its Settings route would. Null for an unknown key.
 */
export function mergeIntegrationEnabled(stored: unknown, key: string, enabled: boolean): IntegrationsConfig | null {
  switch (key) {
    case PARCHMENT_KEY:
      return mergeParchmentSettings(stored, { enabled });
    case AGENTDB_KEY:
      return mergeAgentDbSettings(stored, { enabled });
    case SCRIBE_KEY:
      return mergeScribeSettings(stored, { enabled });
    case ARTIFACTS_KEY:
      return mergeArtifactsSettings(stored, { enabled });
    case AGENT_WIKI_KEY:
      return mergeAgentWikiSettings(stored, { enabled });
    case AGENT_SKILLS_KEY:
      return mergeAgentSkillsSettings(stored, { enabled });
    default:
      return null;
  }
}

export interface IntegrationStatus {
  key: string;
  name: string;
  description: string;
  /** Server holds credentials for it. */
  available: boolean;
  /** The worker's toggle. */
  enabled: boolean;
  /** available && enabled — whether it actually runs. */
  active: boolean;
  /** Why it is unavailable, for the settings screen to show inline. */
  unavailableReason: string | null;
  settings: Record<string, unknown>;
  /**
   * For an integration whose key can be supplied per agent: whether this one
   * uses its own or the fleet's. Never carries the key itself. Absent on
   * integrations that are configured fleet-wide only.
   */
  credentials?: CredentialSummary;
}

export function parchmentStatus(stored: unknown, localOrgId: string): IntegrationStatus {
  const settings = readParchmentSettings(stored);
  const available = isParchmentConfigured();
  return {
    key: PARCHMENT_KEY,
    name: "Parchment",
    description:
      "Ground this worker's answers in the organization's Parchment knowledge base. Read-only: the worker can search sections, never ingest or edit them.",
    available,
    enabled: settings.enabled,
    active: available && settings.enabled,
    unavailableReason: available
      ? null
      : "Set PARCHMENT_API_URL and PARCHMENT_INTERNAL_AGENT_KEY on the API service.",
    settings: {
      workspace_id: settings.workspaceId,
      // Resolved org id is shown so a misconfigured X-Clerk-Org-Id is visible
      // in the UI rather than silently pointing at the wrong workspace.
      org_id: parchmentOrgId(localOrgId, settings.orgId),
      org_id_override: settings.orgId,
      // Host only — the internal key is never serialized.
      api_url: parchmentApiUrl() || null,
    },
  };
}

/**
 * `hasOwnKey` is passed in rather than looked up, because this is sync and the
 * lookup is a decrypt against the database. It matters for exactly the case
 * this integration exists to serve: a deployment with no AgentDB env vars at
 * all, where the only credential is the one an agent pasted in itself. Without
 * it that agent's card would stay greyed out next to a working key.
 */
export function agentDbStatus(
  stored: unknown,
  localOrgId: string,
  hasOwnKey = false,
): IntegrationStatus {
  const settings = readAgentDbSettings(stored);
  const available = isAgentDbConfigured() || hasOwnKey;
  return {
    key: AGENTDB_KEY,
    name: "AgentDB",
    description:
      "Let this worker read the organization's AgentDB database when it answers. Read-only: queries must be a single SELECT, and writes, DDL and multi-statement SQL are refused before they are sent.",
    available,
    enabled: settings.enabled,
    active: available && settings.enabled,
    unavailableReason: available
      ? null
      : "Set AGENTDB_API_URL and AGENTDB_INTERNAL_AGENT_KEY on the API service.",
    settings: {
      workspace_id: settings.workspaceId,
      // Resolved org id is shown so a misconfigured X-Clerk-Org-Id is visible
      // in the UI rather than silently pointing at another org's database.
      org_id: agentDbOrgId(localOrgId, settings.orgId),
      org_id_override: settings.orgId,
      // Host only — the internal key is never serialized.
      api_url: agentDbApiUrl() || null,
      // Whether this server can run the one-time enable call at all. AgentDB
      // requires a user Clerk JWT there and this build has no Clerk, so the
      // screen has to be able to say why enabling is unavailable.
      can_enable_org: hasEnableJwt(),
    },
  };
}

export function scribeStatus(stored: unknown): IntegrationStatus {
  const settings = readScribeSettings(stored);
  const available = isScribeConfigured();
  return {
    key: SCRIBE_KEY,
    name: "Scribe",
    description:
      "Let this worker draw on the organization's meeting record (transcripts, decisions, and action items) when it answers. Read-only, and off by default since meeting notes are internal.",
    available,
    enabled: settings.enabled,
    active: available && settings.enabled,
    unavailableReason: available
      ? null
      : "Set SCRIBE_MCP_URL and SCRIBE_MCP_TOKEN on the API service.",
    settings: {
      lookback_days: settings.lookbackDays,
      // Host only — the token is never serialized.
      api_url: scribeMcpUrl() || null,
    },
  };
}


export function artifactsStatus(stored: unknown): IntegrationStatus {
  const settings = readArtifactsSettings(stored);
  const available = isArtifactsConfigured();
  return {
    key: ARTIFACTS_KEY,
    name: "Agent Artifacts",
    description:
      "Let this worker build branded decks and documents in the workspace's Artifact library. It writes: anything it makes belongs to the workspace and counts against its quota.",
    available,
    enabled: settings.enabled,
    active: available && settings.enabled,
    unavailableReason: available
      ? null
      : "Set ARTIFACTS_MCP_URL and ARTIFACTS_MCP_TOKEN on the API service.",
    settings: {
      brand_kit_id: settings.brandKitId,
      allow_publish: settings.allowPublish,
      workspace: artifactsOrgLabel(),
      // Host only — the workspace token is never serialized.
      api_url: artifactsMcpUrl() || null,
    },
  };
}

export function agentWikiStatus(stored: unknown): IntegrationStatus {
  const settings = readAgentWikiSettings(stored);
  const available = isAgentWikiConfigured();
  return {
    key: AGENT_WIKI_KEY,
    name: "Agent Wiki",
    description:
      "Let this worker search and read the organization's wiki spaces when it answers. Read-only unless you allow writing, and the key's own permissions still decide what it can change.",
    available,
    enabled: settings.enabled,
    active: available && settings.enabled,
    unavailableReason: available
      ? null
      : "Set AGENT_WIKI_MCP_URL and AGENT_WIKI_API_KEY on the API service. Create the key in Agent Wiki under Settings > API keys.",
    settings: {
      space_id: settings.spaceId,
      allow_write: settings.allowWrite,
      // What created the key, for display. Never the key itself.
      key_label: agentWikiKeyLabel(),
      // Host only — the key is never serialized.
      api_url: agentWikiMcpUrl() || null,
    },
  };
}

export async function agentSkillsStatus(
  stored: unknown,
  organizationId: string,
): Promise<IntegrationStatus> {
  const settings = readAgentSkillsSettings(stored);
  const resolved = await resolveSkillsCredentials(organizationId);
  const available = Boolean(resolved);
  return {
    key: AGENT_SKILLS_KEY,
    name: "AIX Skills repository",
    description:
      "Let this worker search the organization's published skills and follow one instead of improvising. Read-only, and found by describing the task rather than switched on one by one.",
    available,
    enabled: settings.enabled,
    active: available && settings.enabled,
    unavailableReason: available
      ? null
      : "Add a key for this agent, or set AIX_SKILLS_API_KEY fleet-wide on the API service.",
    // Whether this agent is on its own key or the fleet's, so the screen can
    // say which and offer to change it.
    credentials: await describeCredentials(
      organizationId,
      SKILLS_PROVIDER,
      [...SKILLS_REQUIRED_FIELDS],
      envSkillsCredentials,
    ),
    settings: {
      category: settings.category,
      max_results: settings.maxResults,
      // Host only — the key is never serialized.
      api_url: resolved ? resolved.values.apiUrl : null,
    },
  };
}

/** Everything the Integrations settings screen lists. */
export async function integrationStatuses(
  stored: unknown,
  localOrgId: string,
): Promise<IntegrationStatus[]> {
  return [
    parchmentStatus(stored, localOrgId),
    agentDbStatus(stored, localOrgId),
    scribeStatus(stored),
    artifactsStatus(stored),
    agentWikiStatus(stored),
    await agentSkillsStatus(stored, localOrgId),
  ];
}
