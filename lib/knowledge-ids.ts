/**
 * Concept ids for an upload batch.
 *
 * Lives here rather than in the route because a Next route file may only
 * export handlers, and because this is the part worth testing directly.
 */
export function slugify(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extensionOf(filename: string): string {
  const match = /\.([^.]+)$/.exec(filename);
  return match ? match[1].toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
}

/**
 * One concept id per file in the batch.
 *
 * The id comes from the filename without its extension, so `policy.md` and
 * `policy.txt` both wanted to be `policy` — and because ingest upserts by
 * concept id, the second silently replaced the first while both were reported
 * as ingested. Uploading two files and getting one document back, with no
 * error, is the worst kind of wrong.
 *
 * Within a batch the extension disambiguates, then a counter if even that
 * collides. Across batches nothing changes: re-uploading `policy.md` still
 * updates the same document, which is what makes re-ingest the way to edit.
 */
export function assignConceptIds(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name, index) => {
    const base = slugify(name) || `doc-${index + 1}`;
    if (!taken.has(base)) {
      taken.add(base);
      return base;
    }
    const withExtension = extensionOf(name) ? `${base}-${extensionOf(name)}` : base;
    let candidate = withExtension;
    let suffix = 2;
    while (taken.has(candidate)) candidate = `${withExtension}-${suffix++}`;
    taken.add(candidate);
    return candidate;
  });
}
