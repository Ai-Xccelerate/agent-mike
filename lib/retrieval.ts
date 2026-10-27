import { retrieve, type KnowledgeMatch } from "@/lib/knowledge";
import { readRetrievalCache, retrievalCacheKey, writeRetrievalCache } from "@/lib/retrieval-cache";
import {
  AGENT_WIKI_KEY,
  PARCHMENT_KEY,
  SCRIBE_KEY,
  readAgentWikiSettings,
  readParchmentSettings,
  readScribeSettings,
} from "@/lib/integrations";
import {
  ParchmentError,
  isParchmentConfigured,
  parchmentAgentId,
  parchmentOrgId,
  queryParchment,
  toKnowledgeMatches,
} from "@/lib/parchment";
import {
  ScribeError,
  askMeetingIntelligence,
  isScribeConfigured,
  toKnowledgeMatches as scribeToKnowledgeMatches,
} from "@/lib/scribe";
import {
  AgentWikiError,
  isAgentWikiConfigured,
  searchWiki,
  toKnowledgeMatches as agentWikiToKnowledgeMatches,
} from "@/lib/agent-wiki";
import { ConfluenceKnowledgeError, confluenceSearchesIndex, searchConfluenceKnowledge } from "@/lib/tools-integrations/atlassian";
import { refreshKnowledgeIndexIfStale } from "@/lib/knowledge-index";
import { DEFAULT_TUNING, searchKnowledgeIndex } from "@/lib/knowledge-search";
import { traceSet } from "@/lib/timing";

const CONFLUENCE_SOURCE = "confluence";

/**
 * One retrieval entry point for the agent: local `knowledge_chunks` plus any
 * enabled external knowledge integration.
 *
 * Parchment is additive grounding, never a replacement — if it is disabled,
 * unconfigured, slow or erroring, the worker still answers from local
 * knowledge. A knowledge integration going down must not take chat down with
 * it, so failures are swallowed into `sources[].error` for the UI and logged
 * once, not thrown.
 */

export interface RetrievalSource {
  source: "local" | "parchment" | "scribe" | "agent_wiki" | "confluence";
  count: number;
  error: string | null;
  /** For Confluence: answered from the saved copy or from the live search. */
  via?: "saved copy" | "live";
}

export interface RetrievalResult {
  matches: KnowledgeMatch[];
  sources: RetrievalSource[];
}

export interface RetrievalProfile {
  organizationId: string;
  slug: string;
  integrationsConfig: unknown;
}

/**
 * Confluence for one question: the saved copy when the organization has switched it on and it has something, otherwise
 * the live search. Any trouble with the copy (empty, error) falls back to live, so a customer never gets less than before.
 */
async function confluenceMatches(
  organizationId: string,
  query: string,
  limit: number,
): Promise<{ matches: KnowledgeMatch[]; fromIndex: boolean } | null> {
  if (await confluenceSearchesIndex(organizationId).catch(() => false)) {
    try {
      const { matches } = await searchKnowledgeIndex(organizationId, query);
      void refreshKnowledgeIndexIfStale(organizationId).catch(() => undefined);
      if (matches.length > 0) return { matches, fromIndex: true };
    } catch (error) {
      console.warn("[retrieval] saved copy failed, using live Confluence:", error instanceof Error ? error.message : error);
    }
  }
  const live = await searchConfluenceKnowledge(organizationId, query, limit);
  return live ? { matches: live, fromIndex: false } : null;
}

export async function retrieveKnowledge(
  profile: RetrievalProfile,
  query: string,
  limit = 5,
): Promise<RetrievalResult> {
  const key = retrievalCacheKey(profile.organizationId, profile.integrationsConfig, limit, query);
  const remembered = readRetrievalCache<RetrievalResult>(key);
  if (remembered) {
    traceSet("knowledgeCached", true);
    return remembered;
  }

  const result = await retrieveKnowledgeUncached(profile, query, limit);
  // A source that failed is not remembered: the next customer should get it back as soon as it is up.
  if (result.sources.every((source) => source.error === null)) writeRetrievalCache(key, result);
  return result;
}

async function retrieveKnowledgeUncached(
  profile: RetrievalProfile,
  query: string,
  limit: number,
): Promise<RetrievalResult> {
  const localMatches = await retrieve(profile.organizationId, query, limit);
  const sources: RetrievalSource[] = [
    { source: "local", count: localMatches.length, error: null },
  ];

  const parchment = readParchmentSettings(profile.integrationsConfig);
  const scribe = readScribeSettings(profile.integrationsConfig);
  const agentWiki = readAgentWikiSettings(profile.integrationsConfig);

  // Every external source is independent of the others and of local search, so
  // they run concurrently — a worker with three knowledge integrations must not
  // wait for the sum of their latencies on every message.
  const [parchmentResult, scribeResult, agentWikiResult, confluenceResult] = await Promise.all([
    parchment.enabled && isParchmentConfigured()
      ? queryParchment({
          orgId: parchmentOrgId(profile.organizationId, parchment.orgId),
          agentId: parchmentAgentId(profile.slug),
          workspaceId: parchment.workspaceId,
          query,
          limit,
        })
          .then((result) => ({ matches: toKnowledgeMatches(result), error: null as string | null }))
          .catch((error: unknown) => ({
            matches: [] as KnowledgeMatch[],
            error: error instanceof ParchmentError ? error.message : "Parchment lookup failed",
          }))
      : null,
    scribe.enabled && isScribeConfigured()
      ? askMeetingIntelligence({ question: query, lookbackDays: scribe.lookbackDays })
          .then((result) => ({
            matches: scribeToKnowledgeMatches(result, limit),
            error: null as string | null,
          }))
          .catch((error: unknown) => ({
            matches: [] as KnowledgeMatch[],
            error: error instanceof ScribeError ? error.message : "Scribe lookup failed",
          }))
      : null,
    // Retrieval only ever reads, so `allowWrite` is irrelevant here — a
    // read-only Agent Wiki key still grounds answers exactly as well.
    agentWiki.enabled && isAgentWikiConfigured()
      ? searchWiki({ query, spaceId: agentWiki.spaceId, limit })
          .then((pages) => ({
            matches: agentWikiToKnowledgeMatches(pages, limit),
            error: null as string | null,
          }))
          .catch((error: unknown) => ({
            matches: [] as KnowledgeMatch[],
            error: error instanceof AgentWikiError ? error.message : "Agent Wiki lookup failed",
          }))
      : null,
    // A connected Confluence (Settings > Integrations > Knowledge base) is
    // searched full-text before every answer, so grounding never depends on
    // the model deciding to look. Null = not connected or switched off.
    confluenceMatches(profile.organizationId, query, limit)
      .then((found) => (found ? { matches: found.matches, fromIndex: found.fromIndex, error: null as string | null } : null))
      .catch((error: unknown) => ({
        matches: [] as KnowledgeMatch[],
        fromIndex: false,
        error: error instanceof ConfluenceKnowledgeError ? error.message : "Confluence lookup failed",
      })),
  ]);

  const lists: KnowledgeMatch[][] = [localMatches];

  for (const [key, result] of [
    [PARCHMENT_KEY, parchmentResult],
    [SCRIBE_KEY, scribeResult],
    [AGENT_WIKI_KEY, agentWikiResult],
    [CONFLUENCE_SOURCE, confluenceResult],
  ] as const) {
    if (!result) continue;
    if (result.error) console.warn(`[retrieval] ${key} lookup failed:`, result.error);
    sources.push({
      source: key,
      count: result.matches.length,
      error: result.error,
      ...(key === CONFLUENCE_SOURCE && "fromIndex" in result ? { via: result.fromIndex ? ("saved copy" as const) : ("live" as const) } : {}),
    });
    if (result.matches.length > 0) lists.push(result.matches);
  }

  // Each source scores on its own scale — Postgres ts_rank, Parchment's score,
  // Scribe's citation ordering — so they are not comparable. Round-robin
  // instead of sorting by `rank`, which would let whichever scale runs largest
  // crowd the others out entirely.
  // The saved copy was tuned to hand over this many sections; the combined cap of five would cut it short.
  // A message with several separate questions comes back with more sections (each question has its own share).
  const cap = confluenceResult && "fromIndex" in confluenceResult && confluenceResult.fromIndex ? Math.max(limit, DEFAULT_TUNING.limit, confluenceResult.matches.length) : limit;
  return { matches: interleaveAll(lists, cap), sources };
}

/** Round-robins any number of ranked lists, preserving each list's ordering. */
export function interleaveAll(lists: KnowledgeMatch[][], limit: number): KnowledgeMatch[] {
  const merged: KnowledgeMatch[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest && merged.length < limit; i += 1) {
    for (const list of lists) {
      if (merged.length >= limit) break;
      if (i < list.length) merged.push(list[i]);
    }
  }
  return merged;
}

/** Round-robins two ranked lists, preserving each list's own ordering. */
export function interleave(
  a: KnowledgeMatch[],
  b: KnowledgeMatch[],
  limit: number,
): KnowledgeMatch[] {
  const merged: KnowledgeMatch[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && merged.length < limit; i += 1) {
    if (i < a.length && merged.length < limit) merged.push(a[i]);
    if (i < b.length && merged.length < limit) merged.push(b[i]);
  }
  return merged;
}
