type ClerkGetToken = (options?: { organizationId?: string; skipCache?: boolean }) => Promise<string | null>;

/**
 * Clerk's session JWT can briefly lag after redirecting from AIX Core (no
 * token minted yet — retried here), or `getToken()` can hand back a cached
 * token that's since expired (still truthy, so this loop alone can't catch
 * it — the backend's 401 is the only reliable signal for that case; see
 * apiFetch's force-refresh retry in worker-api.ts).
 */
export async function getTokenWithRetry(
  getToken: ClerkGetToken,
  organizationId?: string | null,
  attempts = 6,
  skipCache = false,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const options = { ...(organizationId ? { organizationId } : {}), ...(skipCache ? { skipCache: true } : {}) };
    const token = await getToken(options);
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}
