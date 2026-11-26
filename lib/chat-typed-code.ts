import type { CodeCheckResult } from "@/lib/customer-identity";

/**
 * A verification code typed into the chat instead of the code box.
 *
 * EAP, 25 Nov: a visitor typed "579 572." (the code exactly as the email shows it) into the chat. Only the code box
 * checked codes, so the worker read it as an answer to her question, kept asking for a work email, and the visitor was
 * never verified. A message that is nothing but a code is now checked the same way the code box checks it (same
 * attempt limit, same expiry), so typing it in either place works.
 */

/** The 6 digits, when the whole message is a code ("579 572", "579572.", "code: 579-572"); otherwise null. */
export function codeTypedInChat(message: string): string | null {
  const match = message.trim().match(/^(?:(?:my |the )?(?:verification )?code(?: is)?\s*[:\-]?\s*)?(\d{3})[\s-]?(\d{3})\s*[.!]?$/i);
  return match ? `${match[1]}${match[2]}` : null;
}

/** What the worker says back. Null when no code is waiting: the message then goes to the worker as usual. */
export function typedCodeReply(result: CodeCheckResult): string | null {
  switch (result.status) {
    case "verified":
      return `Thanks, that code is right: you're verified as ${result.email}. How can I help?`;
    case "wrong":
      return `That code isn't right. Please check the newest email from us (it may be in your junk or spam folder) and try again. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left.`;
    case "expired":
      return "That code has expired. Use “Send a new code” in the code box to get another one, and check your junk or spam folder if it doesn't arrive.";
    case "locked":
      return "That's too many wrong codes. Use “Send a new code” in the code box to get a new one.";
    default:
      return null;
  }
}
