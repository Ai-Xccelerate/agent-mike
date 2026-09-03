type ClerkGetToken = (opts?: { organizationId?: string }) => Promise<string | null>;

/** Retry Clerk getToken — session JWT can lag briefly after redirect from Core. */
export async function getTokenWithRetry(
  getToken: ClerkGetToken,
  organizationId?: string | null,
  attempts = 6,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const token = organizationId ? await getToken({ organizationId }) : await getToken();
    if (token) return token;
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  return null;
}
