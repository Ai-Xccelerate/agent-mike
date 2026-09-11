import { retrieve, type KnowledgeMatch } from "@/lib/knowledge";
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
  source: "local" | "parchment" | "scribe" | "agent_wiki";
  count: number;
  error: string | null;
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

export async function retrieveKnowledge(
  profile: RetrievalProfile,
  query: string,
  limit = 5,
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
  const [parchmentResult, scribeResult, agentWikiResult] = await Promise.all([
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
  ]);

  const lists: KnowledgeMatch[][] = [localMatches];

  for (const [key, result] of [
    [PARCHMENT_KEY, parchmentResult],
    [SCRIBE_KEY, scribeResult],
    [AGENT_WIKI_KEY, agentWikiResult],
  ] as const) {
    if (!result) continue;
    if (result.error) console.warn(`[retrieval] ${key} lookup failed:`, result.error);
    sources.push({ source: key, count: result.matches.length, error: result.error });
    if (result.matches.length > 0) lists.push(result.matches);
  }

  // Each source scores on its own scale — Postgres ts_rank, Parchment's score,
  // Scribe's citation ordering — so they are not comparable. Round-robin
  // instead of sorting by `rank`, which would let whichever scale runs largest
  // crowd the others out entirely.
  return { matches: interleaveAll(lists, limit), sources };
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
