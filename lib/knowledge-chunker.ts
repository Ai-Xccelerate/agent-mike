/**
 * Cuts a page into sections for searching. The page text comes from `confluenceStorageToText`, which marks each heading
 * with "## ". A section keeps its page title and its heading, so a question can match the exact part of a page, and a
 * long page is never cut off at a fixed length.
 */

export type Section = {
  position: number;
  heading: string | null;
  content: string;
};

/** A section is split once it passes this many characters (roughly 400 tokens). */
const MAX_SECTION_CHARS = 1600;
/** Pieces shorter than this are joined to a neighbour, unless the page has nothing else. */
const MIN_SECTION_CHARS = 120;

function splitLong(text: string): string[] {
  if (text.length <= MAX_SECTION_CHARS) return [text];
  const paragraphs = text.split(/\n{2,}/).flatMap((paragraph) => {
    if (paragraph.length <= MAX_SECTION_CHARS) return [paragraph];
    // A paragraph with no blank lines (a long list or table): split on lines, then sentences, then by length.
    const parts = paragraph.split(/\n+/).flatMap((line) => (line.length <= MAX_SECTION_CHARS ? [line] : line.split(/(?<=[.!?])\s+/)));
    return parts.flatMap((part) => (part.length <= MAX_SECTION_CHARS ? [part] : part.match(new RegExp(`.{1,${MAX_SECTION_CHARS}}`, "gs")) ?? [part]));
  });
  const pieces: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > MAX_SECTION_CHARS && current) {
      pieces.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function chunkPage(title: string, text: string): Section[] {
  const body = text.trim();
  if (!body) return [];
  const blocks = body.split(/\n+(?=## )/).map((block) => {
    const match = /^## (.*)\n?([\s\S]*)$/.exec(block);
    return match ? { heading: match[1].trim() || null, text: match[2].trim() } : { heading: null, text: block.trim() };
  });

  const raw: { heading: string | null; text: string }[] = [];
  for (const block of blocks) {
    if (!block.text && !block.heading) continue;
    for (const piece of splitLong(block.text || (block.heading ?? ""))) raw.push({ heading: block.heading, text: piece });
  }

  // Tiny pieces (a heading with one line) are joined to the one before, so a section is worth finding.
  const joined: { heading: string | null; text: string }[] = [];
  for (const piece of raw) {
    const last = joined[joined.length - 1];
    if (last && piece.text.length < MIN_SECTION_CHARS && last.text.length + piece.text.length <= MAX_SECTION_CHARS) {
      last.text = `${last.text}\n\n${piece.heading ? `${piece.heading}\n` : ""}${piece.text}`;
    } else {
      joined.push({ ...piece });
    }
  }

  const sections = joined.filter((piece) => piece.text.trim().length > 0);
  if (sections.length === 0) return [{ position: 0, heading: null, content: title }];
  return sections.map((piece, position) => ({ position, heading: piece.heading, content: piece.text.trim() }));
}

/** What gets embedded for a section: the title and heading give a short section the context it lacks. */
export function embeddingInput(title: string, section: Section): string {
  return [title, section.heading, section.content].filter(Boolean).join("\n");
}
