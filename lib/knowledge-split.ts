export function splitMarkdown(body: string, maxChars = 1800): Array<[string | null, string]> {
  const sections: Array<[string | null, string]> = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    let raw = buffer.join("\n").trim();
    buffer = [];
    while (raw) {
      if (raw.length <= maxChars) {
        sections.push([heading, raw]);
        break;
      }
      let cut = raw.lastIndexOf("\n\n", maxChars);
      if (cut < maxChars / 2) cut = raw.lastIndexOf(". ", maxChars);
      if (cut < maxChars / 2) cut = maxChars;
      sections.push([heading, raw.slice(0, cut).trim()]);
      raw = raw.slice(cut).trim();
    }
  };

  for (const line of body.split("\n")) {
    const match = line.match(/^#{1,4}\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections.length ? sections : [[null, body.trim()]];
}
