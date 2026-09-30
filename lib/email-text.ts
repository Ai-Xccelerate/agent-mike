/**
 * Email bodies in and out of the email channel.
 *
 * Inbound: Nylas returns HTML with the whole previous thread quoted below the
 * new text. The agent should read only what the customer just wrote; the
 * earlier turns are already in the conversation.
 *
 * Outbound: the agent writes plain text with blank-line paragraphs, and mail
 * clients collapse raw newlines, so replies go out as minimal HTML.
 */

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Everything the customer wrote above the quoted previous messages. */
export function stripQuotedReply(text: string): string {
  const markers = [
    // Gmail / Apple Mail: "On Tue, 30 Sep 2026 at 10:02, Mike <mike@x.com> wrote:" (may wrap once)
    /\n\s*On [^\n]{1,200}?(?:\n[^\n]{0,200}?)?\bwrote:\s*(?:\n|$)/i,
    // Outlook
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*_{5,}\s*\n\s*From:/i,
    /\n\s*From: [^\n]+\n\s*Sent: /i,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(`\n${text}`);
    if (match) cut = Math.min(cut, Math.max(0, match.index - 1));
  }
  return text
    .slice(0, cut)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .trim();
}

/** The customer's new text from a Nylas HTML body, falling back to the snippet. */
export function inboundEmailText(html: string, snippet = ""): string {
  const text = stripQuotedReply(htmlToText(html || ""));
  return text || snippet.trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function textToEmailHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function replySubject(subject: string | null | undefined): string {
  const base = (subject || "").trim() || "Your message";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}
