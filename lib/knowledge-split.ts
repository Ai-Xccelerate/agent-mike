export interface KnowledgeChunkInput {
  heading: string | null;
  content: string;
}

const MAX_CHARS = 1800;

/**
 * Splits an OKF document body into heading-scoped chunks, breaking long
 * sections further so no chunk exceeds MAX_CHARS. Headings are preserved as
 * chunk metadata rather than duplicated into every chunk's content.
 */
export function splitMarkdown(body: string): KnowledgeChunkInput[] {
  const lines = body.split(/\r?\n/);
  const sections: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      sections.push({ heading: headingMatch[2].trim(), lines: [] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }

  const chunks: KnowledgeChunkInput[] = [];
  for (const section of sections) {
    const text = section.lines.join("\n").trim();
    if (!text) continue;

    if (text.length <= MAX_CHARS) {
      chunks.push({ heading: section.heading, content: text });
      continue;
    }

    // Long section: break on paragraph boundaries, accumulating up to MAX_CHARS.
    const paragraphs = text.split(/\n{2,}/);
    let buffer = "";
    for (const para of paragraphs) {
      if ((buffer + "\n\n" + para).length > MAX_CHARS && buffer) {
        chunks.push({ heading: section.heading, content: buffer.trim() });
        buffer = para;
      } else {
        buffer = buffer ? `${buffer}\n\n${para}` : para;
      }
    }
    if (buffer.trim()) chunks.push({ heading: section.heading, content: buffer.trim() });
  }

  return chunks;
}
