/**
 * Messages store citations as jsonb. Current Foundation writes string titles,
 * but older rows may have saved rich objects
 * `{ title, heading, resource, concept_id, document_id }`. Normalize on read so
 * Inbox/Chat never try to render those objects as React children.
 */
export function normalizeCitations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const labels: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) labels.push(trimmed);
      continue;
    }
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const heading = typeof row.heading === "string" ? row.heading.trim() : "";
      if (title) labels.push(title);
      else if (heading) labels.push(heading);
    }
  }
  return labels;
}

export function withNormalizedCitations<T extends { citations?: unknown }>(
  message: T,
): Omit<T, "citations"> & { citations: string[] } {
  return { ...message, citations: normalizeCitations(message.citations) };
}

/**
 * The retrieved articles a reply actually names. The agent's own result carries no citations, so this is how a reply
 * gets them: an article counts only if the reply mentions its title (the instructions have it end an answer with
 * "From: <title>"). Nothing is credited that the customer was not told about, and an answer that cites nothing says so.
 */
export function citedTitles(answer: string, matches: { title: string }[]): string[] {
  const text = answer.toLowerCase();
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const match of matches) {
    const title = match.title.trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    if (text.includes(title.toLowerCase())) titles.push(title);
  }
  return titles;
}

/** The button, menu and field names an answer bolds, for checking them against the pages it was given. */
export function boldTerms(answer: string): string[] {
  const terms = new Set<string>();
  for (const match of answer.matchAll(/\*\*([^*\n]{2,80})\*\*/g)) {
    const term = normalizeForMatch(match[1]);
    if (term) terms.add(term);
  }
  return [...terms];
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[`'’"“”]/g, "").replace(/\s+/g, " ").trim();
}

const GROUNDED_AT = 0.6;
const UNGROUNDED_BELOW = 0.5;
const MIN_TERMS = 2;

/** For each page the reply was given, the share of the reply's bolded names that appear in it. Empty when it bolds too little to tell. */
export function answerSupport(answer: string, matches: { title: string; content: string }[]): { title: string; coverage: number }[] {
  const terms = boldTerms(answer);
  if (terms.length < MIN_TERMS) return [];
  return matches
    .map((match) => {
      const text = normalizeForMatch(match.content);
      return { title: match.title.trim(), coverage: terms.filter((term) => text.includes(term)).length / terms.length };
    })
    .sort((a, b) => b.coverage - a.coverage);
}

/** Pages the reply clearly follows, best first, at most two: used when the reply did not name its source. */
export function groundedTitles(answer: string, matches: { title: string; content: string }[]): string[] {
  return answerSupport(answer, matches)
    .filter((entry) => entry.coverage >= GROUNDED_AT)
    .slice(0, 2)
    .map((entry) => entry.title);
}

/** True when the reply bolds several names and no page it was given carries most of them. */
export function looksUngrounded(answer: string, matches: { title: string; content: string }[]): boolean {
  const support = answerSupport(answer, matches);
  return support.length > 0 && support[0].coverage < UNGROUNDED_BELOW;
}

const escapeForPattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Takes the "From: <article>" line out of the words the customer reads. The worker writes it so the source can be
 * recorded (see citedTitles); once recorded it only repeats the source pill and shows the customer an internal page
 * title. Only a "From:" followed by the title of a page she was given is removed, so a sentence that happens to
 * contain "from:" is never touched.
 */
export function withoutSourceLine(answer: string, titles: string[]): string {
  const known = [...new Set(titles.map((title) => title.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (known.length === 0) return answer;
  const one = known.map(escapeForPattern).join("|");
  const sources = new RegExp(`[ \\t]*\\bFrom:[ \\t]*(?:${one})(?:[ \\t]*[;,][ \\t]*(?:${one}))*[ \\t]*\\.?`, "gi");
  // Mid-line, the words on either side keep one space between them; at a line's start or end nothing is left behind.
  const stripped = answer.replace(sources, (match, offset: number, whole: string) => {
    const before = whole[offset - 1];
    const after = whole[offset + match.length];
    return before && after && before !== "\n" && after !== "\n" ? " " : "";
  });
  return stripped === answer ? answer : stripped.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
