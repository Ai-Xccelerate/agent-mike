import { Agent, run } from "@openai/agents";
import { guardrailModel, modelUnavailabilityReason } from "@/lib/env";

/**
 * A short English search query made from a customer's message, for the knowledge search.
 *
 * Customers write the way they talk: "How do we submit claims? I see the authorization number under open files, but
 * cannot figure out where we submit the claims." The extra clues ("open files", "authorization number") pull a search
 * toward pages that merely contain those words, and a question in Spanish or French matches no English page by words.
 * The rewrite keeps the task and the feature names ("submit claims") and translates. It runs only for messages that
 * are long or not plain English, never replaces the original search (both run and are merged), and quietly gives up
 * on any failure or delay so a slow model never holds a customer's answer.
 */

const REWRITE_WAIT_MS = 1800;
const CACHE_SIZE = 500;
const cache = new Map<string, string | null>();

const INSTRUCTIONS =
  "You turn a customer's message to a software support desk into a search query for the help articles. " +
  "Reply with the query only: 3 to 10 words, in English, naming the task and the screen or feature (for example " +
  '"submit provider claims" or "add a new client organization"). Translate if the message is not in English. ' +
  "Drop greetings, names, background and what the customer already tried, unless it names the feature. " +
  "If the message holds no question about the software, reply with the single word NONE.";

const FOREIGN_WORDS =
  /\b(?:comment|pour|une|les|des|dans|avec|nous|vous|bonjour|como|para|una|los|las|por|necesito|quiero|hola|ein|eine|und|der|das|wie|ich|nicht|uma|voce|obrigado|ola)\b/i;

/** Long messages, and anything with letters outside plain English, are worth rewriting. Short plain ones already search well. */
export function worthRewriting(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (/[À-ɏͰ-῿⺀-￿¿¡]/.test(text)) return true;
  // Typed without accents, French, Spanish, German and Portuguese still give themselves away by their small words.
  if (FOREIGN_WORDS.test(text)) return true;
  return text.split(/\s+/).length >= 9;
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function rewriteForSearch(message: string): Promise<string | null> {
  if (!worthRewriting(message) || modelUnavailabilityReason()) return null;
  const key = normalized(message).slice(0, 600);
  if (cache.has(key)) return cache.get(key) ?? null;

  const writer = new Agent({
    name: "Search query writer",
    instructions: INSTRUCTIONS,
    model: guardrailModel(),
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), REWRITE_WAIT_MS));
  let query: string | null = null;
  try {
    const result = await Promise.race([run(writer, message.slice(0, 1500), { maxTurns: 1 }), timeout]);
    const text = result && typeof result.finalOutput === "string" ? result.finalOutput.trim().replace(/^["'`]+|["'`.]+$/g, "") : "";
    query = text && text.toUpperCase() !== "NONE" && text.length <= 120 ? text : null;
  } catch {
    return null;
  }
  cache.set(key, query);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return query;
}
