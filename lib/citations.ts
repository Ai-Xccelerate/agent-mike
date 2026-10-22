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
