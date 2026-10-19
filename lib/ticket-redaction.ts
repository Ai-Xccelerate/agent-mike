/**
 * Removes client and customer details from support-ticket text, in code, so
 * that nothing identifying reaches a model or the knowledge base.
 *
 * This is pattern matching, not understanding: it removes what has a shape
 * (emails, phone numbers, links, IDs, addresses) and the names it was told
 * about (the people on the ticket), and it drops tickets that mention health
 * or identity documents altogether. It cannot find every name or company in
 * free text, so its output is always meant to be read by a person before it
 * is published.
 */

export type RedactionCounts = Record<string, number>;

export type RedactionResult = { text: string; counts: RedactionCounts };

/** Tickets that mention any of these are left out entirely rather than redacted. */
const SENSITIVE_TERMS =
  /\b(diagnos\w*|medicat\w*|prescri\w*|suicid\w*|self[- ]harm|overdos\w*|psychiatr\w*|psycholog\w*|(?:therapy|session|counselling|counseling|case)\s+notes?|date of birth|d\.?o\.?b\.?|ssn|social (?:insurance|security)(?: number)?|sin number|passport|driver'?s? licen[cs]e|credit card|bank account)\b/i;

export function isSensitiveTicketText(text: string): boolean {
  return SENSITIVE_TERMS.test(text);
}

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const PHONE = /(?<![\w.])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?:\s*(?:ext\.?|extension|x)\s*\d{1,5})?(?![\w])/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b|\b\d{3}\s\d{3}\s\d{3}\b/g;
const DOB = /\b(?:dob|d\.o\.b\.?|date of birth|born(?: on)?)\b\s*[:\-]?\s*(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/gi;
const POSTAL_CA = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi;
const POSTAL_US = /\b(?:A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|P[AR]|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])\s+\d{5}(?:-\d{4})?\b/g;
const STREET =
  /\b\d{1,6}\s+(?:[A-Z][A-Za-z.'-]*\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Crescent|Cres|Place|Pl|Terrace|Highway|Hwy)\b\.?/g;
/** Case, file and account numbers: six or more digits, with or without letters around them. */
const LONG_NUMBER = /\b[A-Za-z]{0,4}[-#]?\d{6,}\b/g;
const TITLED_NAME = /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g;
/** "Hi Dana", "Thanks, Dana Smith": the salutation stays, the name goes. */
const SALUTATION = /\b(Hi|Hello|Hey|Dear|Thanks|Thank you|Regards|Best regards|Kind regards|Warm regards|Cheers|Sincerely|Best)\b([,\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
const MENTION = /\[~accountid:[^\]]+\]|@[A-Za-z][\w.-]{2,}/g;

function bump(counts: RedactionCounts, key: string, by = 1) {
  if (by > 0) counts[key] = (counts[key] ?? 0) + by;
}

function replaceAll(text: string, pattern: RegExp, replacement: string, counts: RedactionCounts, key: string): string {
  return text.replace(pattern, () => {
    bump(counts, key);
    return replacement;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words that are also ordinary English, so replacing them would damage the text. */
const COMMON_WORDS = new Set(["will", "mark", "grant", "bill", "may", "june", "april", "august", "rose", "hope", "joy", "dawn", "page", "case", "faith", "art", "pat", "sue", "ray", "rob", "jack", "frank", "major", "price", "long", "young", "white", "brown", "green", "stone", "hill"]);

/** Every distinct way a person is written down: full name, then each name part that is long enough to be safe to replace. */
export function nameVariants(names: string[]): string[] {
  const variants = new Set<string>();
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (name.length < 2) continue;
    variants.add(name);
    for (const part of name.split(/[\s,]+/)) {
      const word = part.replace(/[^A-Za-z'-]/g, "");
      if (word.length >= 3 && !COMMON_WORDS.has(word.toLowerCase())) variants.add(word);
    }
  }
  // Longest first, so "Dana Smith" is replaced as one name before "Dana" alone.
  return [...variants].sort((a, b) => b.length - a.length);
}

export function redactTicketText(input: string, knownNames: string[] = []): RedactionResult {
  const counts: RedactionCounts = {};
  let text = input.replace(/\r\n?/g, "\n");

  // Order matters: links and emails first, since they contain digits and names
  // that later patterns would otherwise cut in half.
  text = replaceAll(text, URL, "[link]", counts, "links");
  text = replaceAll(text, EMAIL, "[email]", counts, "emails");
  text = replaceAll(text, MENTION, "[name]", counts, "names");
  text = replaceAll(text, DOB, "[date of birth]", counts, "datesOfBirth");
  text = replaceAll(text, SSN, "[id number]", counts, "idNumbers");
  text = replaceAll(text, PHONE, "[phone]", counts, "phones");
  text = replaceAll(text, STREET, "[address]", counts, "addresses");
  text = replaceAll(text, POSTAL_CA, "[postal code]", counts, "postalCodes");
  text = replaceAll(text, POSTAL_US, "[postal code]", counts, "postalCodes");
  text = replaceAll(text, LONG_NUMBER, "[number]", counts, "numbers");

  for (const variant of nameVariants(knownNames)) {
    const pattern = new RegExp(`(?<![A-Za-z])${escapeRegExp(variant)}(?![A-Za-z])`, "gi");
    text = replaceAll(text, pattern, "[name]", counts, "names");
  }
  text = replaceAll(text, TITLED_NAME, "[name]", counts, "names");
  text = text.replace(SALUTATION, (_match, greeting: string, gap: string) => {
    bump(counts, "names");
    return `${greeting}${gap}[name]`;
  });

  return { text: text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), counts };
}

/** Capitalised words that are product or screen names, not people. Used only to judge whether text still looks like it holds a name. */
const NON_NAME_CAPITALS = new Set([
  "EAP", "EAPx", "Expert", "Cloud", "MyAPP", "Dynamic", "Forms", "Online", "Intake", "Self", "Scheduler", "Life", "Service", "Desk", "Provider", "Files",
  "Report", "Reports", "Reporting", "Survey", "Surveys", "Utilization", "Dashboard", "Admin", "Administration", "Settings", "Save", "Cancel", "Submit", "Login", "Log",
  "Sign", "Password", "Reset", "User", "Users", "Account", "Accounts", "License", "Licence", "Case", "Client", "Clients", "Record", "Records", "Form", "Template", "Templates",
  "Calendar", "Appointment", "Appointments", "Schedule", "Scheduling", "Export", "Import", "Excel", "Outlook", "Teams", "Microsoft", "Google", "Chrome", "Edge", "Windows",
  "Salesforce", "Twilio", "Jira", "Confluence", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "June",
  "July", "August", "September", "October", "November", "December", "Menu", "Page", "Tab", "Button", "Field", "Fields", "Error", "Warning", "Message", "Support", "Team",
]);

/**
 * True when, after redaction, there are still capitalised word pairs in the
 * middle of a sentence that aren't known product or screen names: a sign a
 * person's or company's name may have survived. A hint for the reviewer, not a guarantee either way.
 */
export function looksLikeItStillHoldsAName(redacted: string): boolean {
  for (const sentence of redacted.split(/(?<=[.!?\n])\s+/)) {
    const words = sentence.split(/\s+/).slice(1);
    for (let i = 0; i < words.length - 1; i++) {
      const a = words[i].replace(/[^A-Za-z'-]/g, "");
      const b = words[i + 1].replace(/[^A-Za-z'-]/g, "");
      if (/^[A-Z][a-z]{2,}$/.test(a) && /^[A-Z][a-z]{2,}$/.test(b) && !NON_NAME_CAPITALS.has(a) && !NON_NAME_CAPITALS.has(b)) return true;
    }
  }
  return false;
}
