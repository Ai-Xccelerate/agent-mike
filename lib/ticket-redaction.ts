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

/** Engineers' database work: not something a customer-facing article should describe. */
const INTERNAL_WORK = /\b(?:select\b[\s\S]{0,200}?\bfrom\b|update\s+\S+\s+set\b|insert\s+into\b|delete\s+from\b|inner\s+join\b|drop\s+table\b)/i;

export function isInternalEngineeringText(text: string): boolean {
  return INTERNAL_WORK.test(text);
}

/** 8-4-4-4-12 database ids (record keys in a support engineer's SQL). */
const GUID = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
/** A web address written without a scheme: "gorendezvous.com". */
const BARE_DOMAIN = /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|org|net|ca|io|co|edu|gov|us|uk|app|dev)\b(?:\/[^\s]*)?/gi;
/** "password to X", "password is: X", "pwd: X", "temporary password X": the value is removed. */
const SECRET_PHRASE = /\b(?:temp(?:orary)?\s+)?(?:password|passcode|passphrase|pwd|pin|token|secret|api[ -]?key)\b(?:\s+(?:has been|was|is|are|to|for|:|=|reset to|changed to|set to))*\s*[:=]?\s*["']?([^\s"',;\[\]]{4,})/gi;
/** A mixed letters-and-digits string of 8 or more characters looks like a generated password or key. */
const GENERATED_SECRET = /(?<![\w\[])(?=[A-Za-z0-9!@#$%^&*_-]*[A-Za-z])(?=[A-Za-z0-9!@#$%^&*_-]*\d)[A-Za-z0-9!@#$%^&*_-]{8,64}(?![\w\]])/g;
/** "username jdoe", "user id: jdoe", "login name jdoe". */
const USERNAME = /\b(user ?name|user ?id|login (?:name|id))\b(?:\s+(?:is|was|to|for))?\s*[:=]?\s*["']?([A-Za-z0-9._@-]{3,})|\blogin\s*[:=]\s*["']?([A-Za-z0-9._@-]{3,})/gi;
/**
 * "User mhales unable to open system": a login name written straight after "user". Ordinary words that follow "user"
 * ("user cannot", "user guide") are not logins, so a short list of them is skipped.
 */
const USER_HANDLE =
  /\b[Uu]ser\s+(?!(?:is|has|have|had|can|cannot|can't|cant|could|unable|was|were|are|will|would|should|does|did|do|not|no|and|or|to|in|on|at|for|with|of|the|a|an|my|our|account|accounts|login|session|name|names|id|ids|role|roles|type|types|access|permission|permissions|group|groups|profile|profiles|password|passwords|interface|experience|manual|guide|guides|list|lists|field|fields|setting|settings|license|licenses|licence|licences|count|error|errors|data|file|files|record|records|reports?|story|stories|feedback|training|support|that|this|who|which|when|where|then|still|also|just|only|now|cant|isn't|doesn't|didn't|hasn't|won't|wasn't)\b)([a-z][a-z0-9._-]{2,24})\b/g;
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
const LONG_NUMBER = /\b[A-Za-z]{0,4}[-#]?\d{5,}\b/g;
/** "client #8964", "file 1234", "case no. 77": a number that names a person's record is removed whatever its length. */
const RECORD_NUMBER = /\b(client|patient|member|participant|employee|file|case|claim|record|account)s?\s*(?:#|no\.?|number|id)?\s*:?\s*#?\d{1,}\b/gi;
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
  text = replaceAll(text, GUID, "[id]", counts, "ids");
  text = replaceAll(text, URL, "[link]", counts, "links");
  text = replaceAll(text, EMAIL, "[email]", counts, "emails");
  text = replaceAll(text, BARE_DOMAIN, "[link]", counts, "links");
  text = replaceAll(text, MENTION, "[name]", counts, "names");
  // Credentials named as such go first, before anything else can change what they look like.
  text = text.replace(SECRET_PHRASE, (match: string, value: string) => {
    bump(counts, "secrets");
    return match.slice(0, match.length - value.length) + "[secret]";
  });
  text = text.replace(USER_HANDLE, () => {
    bump(counts, "usernames");
    return "user [username]";
  });
  text = text.replace(USERNAME, (match: string, label: string | undefined) => {
    bump(counts, "usernames");
    const word = label ?? match.slice(0, match.search(/[:=]/));
    return `${word.trimEnd()} [username]`;
  });
  text = replaceAll(text, DOB, "[date of birth]", counts, "datesOfBirth");
  text = replaceAll(text, SSN, "[id number]", counts, "idNumbers");
  text = replaceAll(text, PHONE, "[phone]", counts, "phones");
  text = replaceAll(text, STREET, "[address]", counts, "addresses");
  text = replaceAll(text, POSTAL_CA, "[postal code]", counts, "postalCodes");
  text = replaceAll(text, POSTAL_US, "[postal code]", counts, "postalCodes");
  text = text.replace(RECORD_NUMBER, (_match: string, word: string) => {
    bump(counts, "numbers");
    return `${word} [number]`;
  });
  text = replaceAll(text, LONG_NUMBER, "[number]", counts, "numbers");
  // What is left that mixes letters and digits at length looks like a generated password or key.
  text = replaceAll(text, GENERATED_SECRET, "[secret]", counts, "secrets");

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
/** Product and vendor spellings that have capitals in the middle but are not a person or a client. */
const NON_NAME_MIXED_CASE = new Set(["EAPx", "MyAPP", "DevExpress", "PROVIDERfiles", "PDFs", "iPhone", "iOS", "macOS", "OneDrive", "SharePoint", "JavaScript", "GitHub"]);

/**
 * True when, after redaction, the text may still hold a person's or a
 * client's name: capitalised word pairs in the middle of a sentence that
 * aren't known product or screen names, or one-word names with odd capitals
 * ("MYgroup", "GoRendezvous"). Template placeholders in braces are ignored.
 * Such tickets are held back, not passed on: a name that gets through cannot be taken back.
 */
export function looksLikeItStillHoldsAName(redacted: string): boolean {
  const text = redacted.replace(/\{[^}]*\}/g, " ");
  for (const token of text.split(/[^A-Za-z]+/)) {
    if (token.length < 4 || NON_NAME_MIXED_CASE.has(token)) continue;
    if (/^[A-Z]{2,}[a-z]+[A-Za-z]*$/.test(token) || /^[A-Z][a-z]+[A-Z][A-Za-z]*$/.test(token)) return true;
  }
  for (const sentence of text.split(/(?<=[.!?\n])\s+/)) {
    const words = sentence.split(/\s+/).slice(1);
    for (let i = 0; i < words.length - 1; i++) {
      const a = words[i].replace(/[^A-Za-z'-]/g, "");
      const b = words[i + 1].replace(/[^A-Za-z'-]/g, "");
      if (/^[A-Z][a-z]{2,}$/.test(a) && /^[A-Z][a-z]{2,}$/.test(b) && !NON_NAME_CAPITALS.has(a) && !NON_NAME_CAPITALS.has(b)) return true;
    }
  }
  return false;
}
