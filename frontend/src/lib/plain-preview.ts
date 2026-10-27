/**
 * One line of plain text from a message written in Markdown, for a list row: no heading marks, bold or italic marks,
 * list numbers or bullets, code marks or link syntax, with the lines joined by " · ". The message itself is still
 * shown formatted in the thread; this is only for the preview under a name in the Inbox.
 */
export function plainPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/(\*\*|__)(.+?)\1/g, "$2")
        .replace(/(?<![\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, "$1")
        .replace(/`([^`]*)`/g, "$1")
        .trim(),
    )
    .filter(Boolean)
    .join(" · ");
}
