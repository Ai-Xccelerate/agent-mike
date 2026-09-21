type ClerkGetToken = (options?: { organizationId?: string }) => Promise<string | null>;

/** Clerk's session JWT can briefly lag after redirecting from AIX Core. */
export async function getTokenWithRetry(
  getToken: ClerkGetToken,
  organizationId?: string | null,
  attempts = 6,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = organizationId ? await getToken({ organizationId }) : await getToken();
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}
