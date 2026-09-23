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
