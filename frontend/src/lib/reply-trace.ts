// What the manager's "Why this reply?" panel shows (the shape and wording mirror lib/reply-trace.ts on the server).

export type ReplyRoute = "model" | "no_words" | "guardrail_handoff" | "scope_decline" | "fallback_handoff";
export type GroundingVerdict = "follows_pages" | "partly_in_pages" | "not_in_pages" | "too_few_names";

export const ROUTE_LABELS: Record<ReplyRoute, string> = {
  model: "Written by the language model",
  no_words: "A message with no words, so she asked what they need (no model used)",
  guardrail_handoff: "Handed over by a fixed rule before the model ran",
  scope_decline: "The scope check judged it outside her role and sent the polite decline",
  fallback_handoff: "Handed over without an answer because a check failed or the reply was unsafe",
};

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
  events: string[];
  grounding: { verdict: GroundingVerdict; coverage: number | null; names: number; page: string | null; missing: string[] };
  outcome: { handedOver: boolean; askedForDetails: boolean; checkedTickets: boolean; citations: string[] };
  timing: { elapsedMs: number; stages: { stage: string; ms: number }[]; inputTokens: number | null; cachedTokens: number | null };
};
