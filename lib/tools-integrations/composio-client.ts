import { Composio } from "@composio/core";

const MISSING_KEY_ERROR =
  "COMPOSIO_API_KEY is not set. Get an API key from the Composio dashboard.";

let cachedClient: Composio | null = null;

export function getComposioClient(): Composio {
  if (cachedClient) return cachedClient;
  const apiKey = (process.env.COMPOSIO_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(MISSING_KEY_ERROR);
  }
  cachedClient = new Composio({ apiKey });
  return cachedClient;
}

export async function linkConnection(userId: string, authConfigId: string, callbackUrl: string) {
  const request = await getComposioClient().connectedAccounts.link(userId, authConfigId, {
    callbackUrl,
  });
  const redirectUrl = request.redirectUrl;
  if (!redirectUrl) {
    throw new Error("Composio link response missing redirectUrl");
  }
  return { redirectUrl, id: request.id ?? null };
}

export async function getAccountStatus(connectedAccountId: string): Promise<string> {
  const account = await getComposioClient().connectedAccounts.get(connectedAccountId);
  return account.status ?? "";
}

export async function deleteAccount(connectedAccountId: string): Promise<void> {
  await getComposioClient().connectedAccounts.delete(connectedAccountId);
}

export async function executeTool(
  slug: string,
  toolArguments: Record<string, unknown>,
  options: { connectedAccountId: string; userId: string; version: string },
) {
  return getComposioClient().tools.execute(slug, {
    arguments: toolArguments,
    connectedAccountId: options.connectedAccountId,
    userId: options.userId,
    version: options.version,
  });
}

export async function findActiveConnectedAccount(
  userId: string,
  toolkitSlug: string,
): Promise<string | null> {
  const accounts = await getComposioClient().connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [toolkitSlug],
    statuses: ["ACTIVE"],
  });
  return accounts.items[0]?.id ?? null;
}
