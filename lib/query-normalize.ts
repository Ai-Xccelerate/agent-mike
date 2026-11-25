/**
 * Puts a customer's question into the words the knowledge base itself uses, before it is searched.
 *
 * Customers type "LifeExpert" for "Life Expert", "LE" for "Life Expert", "paralels", "protocall", "utilisation", "gate keeping".
 * A word search finds none of those pages by the typed spelling, and the model that reads whatever came back then
 * answers confidently about the wrong thing. The corrections here come from the knowledge base's own vocabulary (its
 * titles, headings and text), so they need no list kept by hand and cannot invent a word the pages do not use.
 * Nothing is removed from the question: the corrected words are added to it.
 */

export type Corpus = {
  /** Each word of the pages (letters only, lower-case) and how many sections contain it. */
  vocabulary: Map<string, number>;
  /** Every section's title, heading and text, lower-cased, for phrase counts. */
  sectionTexts: string[];
  /** Page titles, as written. */
  titles: string[];
};

export type Correction = { from: string; to: string; kind: "split" | "typo" | "join" | "acronym" };

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;
const LETTERS = /^\p{L}+$/u;

export function buildCorpus(sections: { title: string; heading: string | null; content: string }[], titles: string[]): Corpus {
  const vocabulary = new Map<string, number>();
  const sectionTexts: string[] = [];
  for (const section of sections) {
    const text = `${section.title}\n${section.heading ?? ""}\n${section.content}`.toLowerCase();
    sectionTexts.push(text);
    for (const word of new Set(text.match(/\p{L}{3,}/gu) ?? [])) vocabulary.set(word, (vocabulary.get(word) ?? 0) + 1);
  }
  return { vocabulary, sectionTexts, titles };
}

/** Edit distance counting a swap of two neighbouring letters as one edit; gives up above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous2: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, previous2[j - 2] + 1);
      row.push(value);
    }
    previous2 = previous;
    previous = row;
  }
  return previous[b.length];
}

const phraseCount = (corpus: Corpus, phrase: string) => corpus.sectionTexts.reduce((n, text) => (text.includes(phrase) ? n + 1 : n), 0);

/** "lifeexpert" -> "life expert", when the pages say "life expert" more often than they say the one word. */
function splitCompound(word: string, corpus: Corpus): [string, string] | null {
  if (word.length < 7 || !LETTERS.test(word)) return null;
  const own = corpus.vocabulary.get(word) ?? 0;
  let best: { parts: [string, string]; count: number } | null = null;
  for (let i = 3; i <= word.length - 3; i += 1) {
    const [a, b] = [word.slice(0, i), word.slice(i)];
    if ((corpus.vocabulary.get(a) ?? 0) < 2 || (corpus.vocabulary.get(b) ?? 0) < 2) continue;
    const count = phraseCount(corpus, `${a} ${b}`);
    if (count < 1 || (own > 0 && (count < 2 || count < own * 2))) continue;
    if (!best || count > best.count) best = { parts: [a, b], count };
  }
  return best?.parts ?? null;
}

/** "paralels" -> "parallels": the commonest word of the pages within one or two edits. */
function nearestWord(word: string, corpus: Corpus): string | null {
  if (word.length < 5 || !LETTERS.test(word) || corpus.vocabulary.has(word)) return null;
  const max = word.length >= 8 ? 2 : 1;
  let best: { word: string; distance: number; count: number } | null = null;
  for (const [candidate, count] of corpus.vocabulary) {
    if (candidate[0] !== word[0] || count < 3 || Math.abs(candidate.length - word.length) > max) continue;
    const distance = editDistance(word, candidate, max);
    if (distance > max) continue;
    if (!best || distance < best.distance || (distance === best.distance && count > best.count)) best = { word: candidate, distance, count };
  }
  return best?.word ?? null;
}

/** "LE" -> "Life Expert": the opening words of page titles whose initials are the capitals typed. */
function expandAcronym(token: string, corpus: Corpus): string | null {
  if (!/^\p{Lu}{2,4}$/u.test(token)) return null;
  const initials = token.toLowerCase();
  const counts = new Map<string, number>();
  for (const title of corpus.titles) {
    const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (words.length < initials.length) continue;
    const opening = words.slice(0, initials.length);
    if (opening.map((word) => word[0]).join("") === initials) counts.set(opening.join(" "), (counts.get(opening.join(" ")) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || ranked[0][1] < 2 || (ranked[1] && ranked[1][1] * 2 > ranked[0][1])) return null;
  return ranked[0][0];
}

/** The question with its misspelt, run-together and abbreviated words put right, and what was changed. */
export function normalizeQuestion(question: string, corpus: Corpus): { text: string; corrections: Correction[]; extraWords: string[] } {
  const corrections: Correction[] = [];
  const extraWords: string[] = [];
  const tokens = [...question.matchAll(WORD)];
  let text = "";
  let cursor = 0;
  for (const [index, match] of tokens.entries()) {
    const token = match[0];
    const lower = token.toLowerCase();
    let replacement: string | null = null;
    if (!/\d/.test(token) && !token.includes("-")) {
      const acronym = expandAcronym(token, corpus);
      const split = acronym ? null : splitCompound(lower, corpus);
      const typo = acronym || split ? null : nearestWord(lower, corpus);
      if (acronym) { replacement = acronym; corrections.push({ from: token, to: acronym, kind: "acronym" }); }
      else if (split) { replacement = split.join(" "); corrections.push({ from: token, to: replacement, kind: "split" }); }
      else if (typo) { replacement = typo; corrections.push({ from: token, to: typo, kind: "typo" }); }
      // Two words typed apart that the pages write as one: "gate keeping" -> "gatekeeping".
      const next = tokens[index + 1];
      if (!replacement && next && /^\p{L}+$/u.test(lower) && /^\p{L}+$/u.test(next[0])) {
        const joined = `${lower}${next[0].toLowerCase()}`;
        if (joined.length >= 7 && (corpus.vocabulary.get(joined) ?? 0) >= 1) {
          extraWords.push(joined);
          corrections.push({ from: `${token} ${next[0]}`, to: joined, kind: "join" });
        }
      }
    }
    text += question.slice(cursor, match.index) + (replacement ?? token);
    cursor = (match.index ?? 0) + token.length;
  }
  text += question.slice(cursor);
  return { text, corrections, extraWords };
}
