/**
 * What a customer typed about themselves in the chat: the name and email they
 * gave when the worker asked. Display only. It is never used to look up the
 * customer's other tickets or to treat them as verified, because anyone can
 * type any address into a chat; the verified fields on the conversation
 * (customer_name, customer_email) stay as they are.
 */

export type StatedCustomer = { name: string | null; email: string | null };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
// Words are joined by spaces or tabs only, so a name never runs onto the next line.
const NAME = "[A-Z][\\p{L}'’-]+(?:[ \\t]+[A-Z][\\p{L}'’-]+){0,2}";
// "my name is Dana Reyes", "name: Dana Reyes", "this is Dana Reyes" (two or more words, so "this is Urgent" is not a name)
const INTRODUCED = [
  new RegExp(`\\bmy name is[ \\t]+(${NAME})`, "u"),
  new RegExp(`\\b[Nn]ame[ \\t]*:[ \\t]*(${NAME})`, "u"),
  new RegExp(`\\bthis is[ \\t]+([A-Z][\\p{L}'’-]+[ \\t]+[A-Z][\\p{L}'’-]+)`, "u"),
];
// "Dana Reyes, dana@example.com, Riverside Counseling": two or three capitalised words, then a separator, then the email
const NAME_THEN_EMAIL = new RegExp(`^\\s*(${NAME.replace("{0,2}", "{1,2}")})\\s*[,;|–-]\\s*\\S*@`, "u");

const NOT_NAMES = new Set(["hello team", "thank you", "good morning", "good afternoon", "kind regards", "best regards"]);

function cleanName(raw: string | undefined): string | null {
  const name = raw?.trim().replace(/[.,;]+$/, "");
  if (!name || name.length > 60 || NOT_NAMES.has(name.toLowerCase())) return null;
  return name;
}

/**
 * The first name and first email found in the customer's own messages, oldest
 * first. Null when they gave neither.
 */
export function extractStatedCustomer(customerMessages: string[]): StatedCustomer | null {
  let email: string | null = null;
  let name: string | null = null;
  for (const body of customerMessages) {
    if (!email) email = body.match(EMAIL)?.[0].toLowerCase() ?? null;
    if (!name) {
      for (const pattern of INTRODUCED) {
        name = cleanName(body.match(pattern)?.[1]);
        if (name) break;
      }
    }
    if (!name && EMAIL.test(body)) name = cleanName(body.match(NAME_THEN_EMAIL)?.[1]);
    if (name && email) break;
  }
  return name || email ? { name, email } : null;
}
