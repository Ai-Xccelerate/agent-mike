import { answerSupport, boldTerms } from "@/lib/citations";
import type { KnowledgeMatch } from "@/lib/knowledge";

/**
 * Why the worker replied the way it did, kept per reply for managers ("Why this reply?"). It records what was in play and
 * what each check said, not why the language model chose its words: that is not something a model reports. Everything here
 * is drawn from the turn's own record (lib/timing.ts), so it costs one small row per reply and no extra model call.
 */

export type ReplyRoute =
  | "model" // the language model wrote the reply
  | "no_words" // a message with no words: asked what they need, without the model
  | "guardrail_handoff" // a fixed rule (allowed domains, injection phrases, console questions) handed it over before the model
  | "scope_decline" // the scope check judged it outside the worker's role and sent the polite decline
  | "fallback_handoff"; // something failed or was unsafe, so the worker handed over without an answer

export const ROUTE_LABELS: Record<ReplyRoute, string> = {
  model: "Written by the language model",
  no_words: "A message with no words, so Eva asked what they need (no model used)",
  guardrail_handoff: "Handed over by a fixed rule before the model ran",
  scope_decline: "The scope check judged it outside Eva's role and sent the polite decline",
  fallback_handoff: "Handed over without an answer because a check failed or the reply was unsafe",
};

export type GroundingVerdict = "follows_pages" | "partly_in_pages" | "not_in_pages" | "too_few_names";

export const GROUNDING_LABELS: Record<GroundingVerdict, string> = {
  follows_pages: "Follows the pages she was given",
  partly_in_pages: "Partly in the pages she was given",
  not_in_pages: "Not found in the pages she was given",
  too_few_names: "Too few button or menu names to check",
};

export type ReplyTrace = {
  v: 1;
  route: ReplyRoute;
  routeReason: string | null;
  instructions: { model: string; tone: string; roleChars: number; jobDescriptionChars: number; additionalInstructions: boolean } | null;
  skills: { on: string[]; loaded: string[] };
  tools: { offered: string[]; called: string[] };
  knowledge: {
    via: "saved copy" | "live Confluence" | "local only" | "none";
    cached: boolean;
    sources: { name: string; count: number; error: string | null }[];
    sections: { title: string; heading: string | null; chars: number }[];
  };
  checks: {
    intent: { outOfScope: boolean; escalate: boolean; injection: boolean; confidence: number; reason: string; themes: string[] } | null;
    reply: { action: string; reason: string } | null;
  };
  /** Things that changed what the customer got: retries, repairs, safety nets. */
  events: string[];
  grounding: { verdict: GroundingVerdict; coverage: number | null; names: number; page: string | null; missing: string[] };
  outcome: { handedOver: boolean; askedForDetails: boolean; checkedTickets: boolean; citations: string[] };
  timing: { elapsedMs: number; stages: { stage: string; ms: number }[]; inputTokens: number | null; cachedTokens: number | null };
};

type Facts = Record<string, unknown>;
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/**
 * How closely a reply follows the pages it was given: the share of the button, menu and field names it bolds that appear
 * in them. Pages she read with a tool count too. Fewer than two bolded names is too little to judge.
 */
export function groundingOf(
  answer: string,
  pages: { title: string; content: string }[],
): ReplyTrace["grounding"] {
  const names = boldTerms(answer);
  const support = answerSupport(answer, pages);
  if (support.length === 0) return { verdict: "too_few_names", coverage: null, names: names.length, page: null, missing: [] };
  const best = support[0];
  const verdict: GroundingVerdict = best.coverage >= 0.6 ? "follows_pages" : best.coverage >= 0.5 ? "partly_in_pages" : "not_in_pages";
  const text = pages.find((page) => page.title.trim() === best.title)?.content.toLowerCase().replace(/[`'’"“”]/g, "").replace(/\s+/g, " ") ?? "";
  const missing = names.filter((name) => !text.includes(name));
  return { verdict, coverage: Math.round(best.coverage * 100) / 100, names: names.length, page: best.title, missing: missing.slice(0, 8) };
}

export function buildReplyTrace(input: {
  facts: Facts;
  stages: { stage: string; ms: number }[];
  notes: Record<string, number>;
  elapsedMs: number;
  answer: string;
  citations: string[];
  escalated: boolean;
  needIdentity: boolean;
  checkedTickets: boolean;
  matches: KnowledgeMatch[];
  sources: { source: string; count: number; error: string | null; via?: "saved copy" | "live" }[];
  readPages: { title: string; text: string }[];
  noWords: boolean;
  guardrailReason: string | null;
  cached: boolean;
}): ReplyTrace {
  const f = input.facts;
  const confluence = input.sources.find((source) => source.source === "confluence");
  const via: ReplyTrace["knowledge"]["via"] =
    confluence && confluence.count > 0 ? (confluence.via === "saved copy" ? "saved copy" : "live Confluence") : input.matches.length > 0 ? "local only" : "none";
  const route: ReplyRoute = (f.route as ReplyRoute | undefined) ?? (input.noWords ? "no_words" : input.guardrailReason ? "guardrail_handoff" : "model");
  const routeReason = (f.routeReason as string | undefined) ?? (route === "guardrail_handoff" ? input.guardrailReason : null);
  const corpus = [...input.matches.map((match) => ({ title: match.title, content: match.content })), ...input.readPages.map((page) => ({ title: page.title, content: page.text }))];

  return {
    v: 1,
    route,
    routeReason: routeReason ?? null,
    instructions: (f.instructions as ReplyTrace["instructions"] | undefined) ?? null,
    skills: { on: list<string>(f.skillsOn), loaded: [...new Set(list<string>(f.skillsLoaded))] },
    tools: { offered: list<string>(f.toolsOffered), called: list<string>(f.toolsCalled) },
    knowledge: {
      via,
      cached: input.cached,
      sources: input.sources.map((source) => ({ name: source.source, count: source.count, error: source.error })),
      sections: input.matches.map((match) => ({ title: match.title, heading: match.heading ?? null, chars: match.content.length })),
    },
    checks: { intent: (f.intent as ReplyTrace["checks"]["intent"] | undefined) ?? null, reply: (f.replyCheck as ReplyTrace["checks"]["reply"] | undefined) ?? null },
    events: list<string>(f.events),
    grounding: route === "model" ? groundingOf(input.answer, corpus) : { verdict: "too_few_names", coverage: null, names: 0, page: null, missing: [] },
    outcome: { handedOver: input.escalated, askedForDetails: input.needIdentity, checkedTickets: input.checkedTickets, citations: input.citations },
    timing: { elapsedMs: input.elapsedMs, stages: input.stages, inputTokens: input.notes.inputTokens ?? null, cachedTokens: input.notes.cachedTokens ?? null },
  };
}

/** A few lines of the record, small enough to keep with a rating so a correction carries its cause. */
export function summarizeTrace(trace: ReplyTrace) {
  return {
    route: trace.route,
    routeReason: trace.routeReason,
    pagesUsed: trace.knowledge.sections.slice(0, 6).map((section) => (section.heading ? `${section.title} / ${section.heading}` : section.title)),
    knowledgeVia: trace.knowledge.via,
    skillsLoaded: trace.skills.loaded,
    toolsCalled: trace.tools.called,
    events: trace.events,
    grounding: { verdict: trace.grounding.verdict, coverage: trace.grounding.coverage, missing: trace.grounding.missing },
    replyCheck: trace.checks.reply?.action ?? null,
    handedOver: trace.outcome.handedOver,
  };
}

/** The record as plain text a manager can paste to someone else. It holds no customer text; the reply itself is added by the caller. */
export function traceAsText(trace: ReplyTrace): string {
  const lines: string[] = [];
  lines.push(`How: ${ROUTE_LABELS[trace.route]}${trace.routeReason ? ` (${trace.routeReason})` : ""}`);
  if (trace.instructions) {
    lines.push(
      `In play: model ${trace.instructions.model}, tone "${trace.instructions.tone}", role ${trace.instructions.roleChars} characters, job description ${trace.instructions.jobDescriptionChars} characters, additional instructions ${trace.instructions.additionalInstructions ? "on" : "off"}`,
    );
  }
  lines.push(`Skills available: ${trace.skills.on.join(", ") || "none"}; loaded this turn: ${trace.skills.loaded.join(", ") || "none"}`);
  lines.push(`Tools offered: ${trace.tools.offered.join(", ") || "none"}; called: ${trace.tools.called.join(", ") || "none"}`);
  lines.push(`Knowledge: ${trace.knowledge.via}${trace.knowledge.cached ? " (remembered from a moment ago)" : ""}`);
  for (const section of trace.knowledge.sections) lines.push(`  - ${section.title}${section.heading ? ` / ${section.heading}` : ""} (${section.chars} characters)`);
  if (trace.checks.intent) {
    const i = trace.checks.intent;
    lines.push(`Scope check: ${i.outOfScope ? "outside the role" : "in scope"}, ${i.escalate ? "should go to a person" : "no handoff"}, ${i.injection ? "looks like an override attempt" : "no override attempt"}, confidence ${i.confidence}${i.reason ? ` (${i.reason})` : ""}`);
  }
  if (trace.checks.reply) lines.push(`Reply check: ${trace.checks.reply.action}${trace.checks.reply.reason ? ` (${trace.checks.reply.reason})` : ""}`);
  if (trace.events.length > 0) lines.push(`Safety nets and retries: ${trace.events.join("; ")}`);
  const g = trace.grounding;
  lines.push(
    `Faithfulness: ${GROUNDING_LABELS[g.verdict]}${g.coverage !== null ? ` (${Math.round(g.coverage * 100)}% of ${g.names} names found${g.page ? ` in "${g.page}"` : ""})` : ""}${g.missing.length > 0 ? `; not in the pages: ${g.missing.join(", ")}` : ""}`,
  );
  lines.push(`Outcome: ${trace.outcome.handedOver ? "handed over" : "answered"}${trace.outcome.askedForDetails ? ", asked for name and email" : ""}; sources recorded: ${trace.outcome.citations.join(", ") || "none"}`);
  lines.push(`Time: ${(trace.timing.elapsedMs / 1000).toFixed(1)} s (${trace.timing.stages.map((s) => `${s.stage} ${s.ms} ms`).join(", ") || "no stages"})`);
  return lines.join("\n");
}
