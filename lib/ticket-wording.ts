/** Wording shared by every prompt that writes a ticket's title or summary. No imports: used by modules that import each other. */

/**
 * Only what the conversation shows. 27 Nov, EAP (SDS-63): a chat the worker had answered itself was logged as "EAPx Cloud
 * screen remains frozen after refresh" (the customer had not replied), and 10 of 10 titles added "while adding a counseling
 * case", taken from the name of the article the worker cited.
 */
export const FACTS_ONLY =
  "Write only what the conversation shows. Never say a problem continues, was fixed or was tried unless the customer " +
  "said so: steps the worker suggested are not steps the customer took. Never take details from the name of an article " +
  "the worker cited.";
