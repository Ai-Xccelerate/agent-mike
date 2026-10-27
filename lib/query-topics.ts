import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { guardrailModel, modelUnavailabilityReason } from "@/lib/env";

/**
 * The separate things a customer asks in one message, so the knowledge search can look for each. One search for
 * "how do I add a provider, change an email, set up reminders and export data" hands the worker pages for whichever
 * topic ranks best and tells her the rest "are not covered", though every page exists.
 *
 * Three safeguards keep it from going wrong. A cheap check decides whether a message is even worth asking about, so an
 * ordinary question never reaches the model. The model returns topics only for three or more clearly different tasks
 * (two halves of one task are one topic), and the code validates what it returns. And the original search always runs
 * as well, so a wrong split can add results but never take any away. Any failure or delay means no topics.
 */

export const MIN_TOPICS = 3;
export const MAX_TOPICS = 6;
const TOPICS_WAIT_MS = 2500;
const CACHE_SIZE = 300;
const cache = new Map<string, string[]>();

const INTERROGATIVE = /\b(?:how|where|what|when|why|which)\b/gi;

/**
 * Whether a message is long and list-like enough to be worth asking the model about. A short question, or a long one
 * with a single ask, is left alone.
 */
export function worthSplitting(message: string): boolean {
  const text = message.trim();
  const words = text.split(/\s+/).length;
  if (words < 12) return false;
  const questionWords = (text.match(INTERROGATIVE) ?? []).length + (text.match(/\?/g) ?? []).length - (text.endsWith("?") ? 1 : 0);
  const separators = (text.match(/[?;\n]|,\s|\s+and\s+|\s+also\s+/gi) ?? []).length;
  return questionWords >= 3 || (questionWords >= 1 && separators >= 3 && words >= 14);
}

const TopicsSchema = z.object({ topics: z.array(z.string()) });

/** Keeps only what can be a search question: trimmed, short, distinct; and nothing at all unless there are enough. */
export function validTopics(raw: string[]): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const entry of raw) {
    const topic = entry.trim().replace(/^["'`\-\d.)\s]+|["'`\s]+$/g, "");
    const key = topic.toLowerCase();
    if (topic.length < 6 || topic.length > 120 || topic.split(/\s+/).length < 2 || seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
  }
  return topics.length >= MIN_TOPICS ? topics.slice(0, MAX_TOPICS) : [];
}

const INSTRUCTIONS =
  "A customer wrote one message to a software support desk. List the separate things they want to know or do, each as a " +
  "short stand-alone search question of 3 to 10 words, in English, naming the task and the screen or feature (for example " +
  '"add a new provider" or "export account data to accounting"). Only list topics when there are three or more clearly ' +
  'different tasks or questions. Two halves of one task ("add and remove specializations") are ONE topic, and background, ' +
  "greetings and what the customer already tried are not topics. If there are fewer than three, return an empty list.";

export async function topicsForSearch(message: string): Promise<string[]> {
  if (!worthSplitting(message) || modelUnavailabilityReason()) return [];
  const key = message.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 800);
  const cached = cache.get(key);
  if (cached) return cached;

  const splitter = new Agent({
    name: "Question splitter",
    instructions: INSTRUCTIONS,
    model: guardrailModel(),
    outputType: TopicsSchema,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TOPICS_WAIT_MS));
  try {
    const result = await Promise.race([run(splitter, message.slice(0, 1500), { maxTurns: 1 }), timeout]);
    if (!result) return [];
    const parsed = TopicsSchema.safeParse(result.finalOutput);
    const topics = parsed.success ? validTopics(parsed.data.topics) : [];
    cache.set(key, topics);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    return topics;
  } catch {
    return [];
  }
}
