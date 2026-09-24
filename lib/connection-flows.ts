import { getAuthConfigId } from "@/lib/tools-integrations/auth-configs";
import { findActiveConnectedAccount, linkConnection } from "@/lib/tools-integrations/composio-client";
import {
  attachConnectedAccountId,
  markConnectionActive,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";
import { getIntegrationType } from "@/lib/tools-integrations/registry";
import { DEFAULT_SCOPES, buildAuthUrl, callbackUri, resolveNylasCredentials, signState } from "@/lib/nylas";

/**
 * Starting an OAuth connection, shared by the Settings routes and the admin
 * Assistant (which only gets here after the manager approved "Connect X").
 * Each returns the URL the browser should visit; nothing is connected until
 * the manager finishes signing in there.
 */

export class ConnectionFlowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
  }
}

export async function startIntegrationConnection(input: {
  organizationId: string;
  integrationType: string;
  system: string;
  connectedBy: string;
  appOrigin: string;
}): Promise<{ redirectUrl: string | null; alreadyConnected?: boolean }> {
  if (!getIntegrationType(input.integrationType)) {
    throw new ConnectionFlowError(`Unknown integration type "${input.integrationType}"`, 400);
  }

  let authConfigId: string;
  try {
    authConfigId = getAuthConfigId(input.system);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid auth config";
    throw new ConnectionFlowError(message, message.endsWith("is not set") ? 500 : 400);
  }

  const callbackUrl = `${input.appOrigin}/settings/integrations`;
  let linked: { redirectUrl: string; id: string | null };
  try {
    linked = await linkConnection(input.organizationId, authConfigId, callbackUrl);
  } catch (error) {
    // Composio refuses a second link when one already exists for this
    // user+auth-config (e.g. a connection made outside our own DB's
    // tracking, or a row that got lost). Rather than surface Composio's raw
    // "multiple connected accounts" error, adopt the account it already has
    // if one is genuinely active — that is what the manager actually wants.
    const active = await findActiveConnectedAccount(input.organizationId, input.system);
    if (!active) {
      throw new ConnectionFlowError(error instanceof Error ? error.message : "Composio link failed", 502);
    }
    const row = await upsertPendingConnection({
      organizationId: input.organizationId,
      integrationType: input.integrationType,
      system: input.system,
      composioAuthConfigId: authConfigId,
      connectedBy: input.connectedBy,
    });
    await markConnectionActive(row.id, active);
    return { redirectUrl: null, alreadyConnected: true };
  }

  const row = await upsertPendingConnection({
    organizationId: input.organizationId,
    integrationType: input.integrationType,
    system: input.system,
    composioAuthConfigId: authConfigId,
    connectedBy: input.connectedBy,
  });
  if (linked.id) {
    await attachConnectedAccountId(row.id, linked.id);
  }
  return { redirectUrl: linked.redirectUrl };
}

export async function startMailboxConnection(input: {
  organizationId: string;
  userId: string;
  appOrigin: string;
  provider?: string | null;
  loginHint?: string | null;
}): Promise<{ redirectUrl: string; redirectUri: string }> {
  const resolved = await resolveNylasCredentials(input.organizationId);
  if (!resolved) {
    throw new ConnectionFlowError(
      "No Nylas application is configured for this agent",
      422,
      "Add a Nylas client ID and API key below, or set them fleet-wide on the API service.",
    );
  }

  const provider = input.provider || null;
  const redirectUri = callbackUri(input.appOrigin);
  try {
    const url = buildAuthUrl({
      credentials: resolved.values,
      redirectUri,
      // Signed rather than stored: the callback has no session to look anything
      // up in, and an unsigned state would let anyone bind a mailbox they
      // control to someone else's worker.
      state: signState(input.organizationId, input.userId),
      provider,
      loginHint: input.loginHint || null,
      // DEFAULT_SCOPES are Google-specific OAuth scope URLs. The manager never
      // picks a provider here — Nylas's hosted auth page does that — so only
      // send them when we're actually sure this is a Google connection;
      // otherwise let Nylas apply the provider's own default scopes.
      scopes: provider === "google" ? DEFAULT_SCOPES : undefined,
    });
    return { redirectUrl: url, redirectUri };
  } catch (error) {
    throw new ConnectionFlowError(error instanceof Error ? error.message : "Could not start Nylas auth", 502);
  }
}
