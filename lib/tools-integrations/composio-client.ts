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

export type ComposioActionSchema = {
  slug: string;
  name: string;
  description?: string;
  toolkit: string;
  version?: string;
  tags: string[];
  isDeprecated: boolean;
  inputParameters?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

function toActionSchema(raw: {
  slug: string;
  name: string;
  description?: string;
  toolkit?: { slug?: string };
  version?: string;
  tags?: string[];
  isDeprecated?: boolean;
  inputParameters?: { properties?: Record<string, unknown>; required?: string[] };
}): ComposioActionSchema {
  return {
    slug: raw.slug,
    name: raw.name,
    description: raw.description,
    toolkit: (raw.toolkit?.slug ?? "").toLowerCase(),
    version: raw.version,
    tags: raw.tags ?? [],
    isDeprecated: raw.isDeprecated === true,
    inputParameters: raw.inputParameters,
  };
}

/** Actions in the given toolkits matching a free-text search, as Composio describes them. */
export async function searchActions(toolkits: string[], search: string, limit: number): Promise<ComposioActionSchema[]> {
  const tools = await getComposioClient().tools.getRawComposioTools({ toolkits, search, limit });
  return tools.map(toActionSchema);
}

/** One action's current schema, including the toolkit version to execute it with. */
export async function getActionSchema(slug: string): Promise<ComposioActionSchema> {
  return toActionSchema(await getComposioClient().tools.getRawComposioToolBySlug(slug));
}

/** The site a connection signed in to, e.g. https://acme.atlassian.net. Null when Composio doesn't record one. */
export async function getAccountSite(connectedAccountId: string): Promise<string | null> {
  const account = (await getComposioClient().connectedAccounts.get(connectedAccountId)) as {
    data?: { base_url?: unknown };
    params?: { base_url?: unknown };
  };
  const site = account.data?.base_url ?? account.params?.base_url;
  return typeof site === "string" && site ? site : null;
}

/**
 * A raw HTTP call made with a connection's credentials, for APIs Composio has
 * no action for (e.g. Jira Service Management's request API). The endpoint
 * is an absolute URL.
 */
export async function proxyRequest(options: {
  connectedAccountId: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT";
  body?: unknown;
}): Promise<{ status: number; data: unknown }> {
  const response = await getComposioClient().tools.proxyExecute({
    endpoint: options.endpoint,
    method: options.method,
    connectedAccountId: options.connectedAccountId,
    ...(options.body === undefined ? {} : { body: options.body }),
  });
  return { status: response.status, data: response.data };
}
