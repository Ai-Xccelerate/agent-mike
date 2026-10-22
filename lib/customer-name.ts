const PLACEHOLDER_NAME = /^(website visitor|visitor \d+)$/i;

/** The widget's stand-in name for someone who hasn't given theirs ("Website visitor", or "Visitor 4821"). */
export function isPlaceholderCustomerName(name: string | null | undefined): boolean {
  return !name || PLACEHOLDER_NAME.test(name.trim());
}
