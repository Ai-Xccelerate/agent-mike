export const fieldClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
export const textareaClass =
  "w-full resize-y rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm leading-6 text-gray-800 shadow-theme-xs outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
export const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6";

/**
 * What an internal tool says when the server holds no credentials for it.
 *
 * The API reports exactly which environment variables are missing, which is
 * the right answer for whoever deploys the service and the wrong one here: a
 * manager cannot act on a variable name, and printing it leaks the server's
 * configuration into a product surface. The detail stays in the API response
 * for support and logs — the screen just says who can fix it.
 */
export const NOT_CONNECTED_NOTE =
  "Not connected yet — an administrator sets this up on the API service.";
