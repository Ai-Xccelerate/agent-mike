"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { IntegrationCardStatus } from "@/components/worker/settings/IntegrationCard";
import ConnectMethodDialog, { type ConnectMethod } from "@/components/worker/settings/ConnectMethodDialog";
import ConnectionSettingsDialog, {
  connectionSettingsNote,
  hasConnectionSettings,
} from "@/components/worker/settings/ConnectionSettingsForm";
import {
  connectIntegration,
  disconnectIntegration,
  getConnectMethods,
  getIntegrationConnection,
  type IntegrationConnection,
} from "@/lib/worker-api";

export type VendorOption = { system: string; label: string; icon: ReactNode; /** What this vendor does, when it differs from the category's line. */ description?: string };

export type CategoryInput = {
  integrationType: string;
  vendors: VendorOption[];
  /** The category's name, shown under each vendor: "Helpdesk", "Knowledge base". */
  title: string;
  description: string;
};

/** One vendor as the Connections page shows it: where it stands and what can be done with it. */
export type VendorState = {
  vendor: VendorOption;
  integrationType: string;
  category: string;
  description: string;
  status: IntegrationCardStatus;
  /** Why it cannot be connected right now, or what to do next. */
  note?: string;
  /** Label of the connect button; undefined when there is nothing to press. */
  connectLabel?: string;
  connect: () => void;
  connecting: boolean;
  /** Any connect in this category is in flight, so the others wait. */
  busy: boolean;
  disconnect: () => Promise<void>;
  disconnecting: boolean;
  /** Opens this connection's own settings; undefined when it has none. */
  openSettings?: () => void;
};

/**
 * A category (CRM, Email, ...) can hold several vendors, but the connection
 * itself is one slot per category, not per vendor — Email is Gmail *or*
 * Outlook, never both (see IntegrationConnection.system on the API side).
 * This owns that shared state and renders one IntegrationCard per vendor:
 * the connected one shows Disconnect, the rest show Unavailable rather than
 * a second "Connect" that would silently replace the active one.
 */
/** How long a connection may sit in "pending" before the card offers a retry. */
const STUCK_AFTER_MS = 20_000;

/** Systems that ask how to connect first: a person's sign-in, or a service account's API key or client credentials. */
const API_KEY_SYSTEMS = new Set(["jira", "confluence"]);

/**
 * The state behind one category. It was a section that drew its own cards (one category per block); the Connections
 * page now lists connected vendors and available ones separately, so the state is a hook and the page does the drawing.
 * `dialogs` must be rendered once: the settings dialog and the "how to connect" chooser live there.
 */
export function useIntegrationCategory({ integrationType, vendors, title, description }: CategoryInput): {
  vendors: VendorState[];
  dialogs: ReactNode;
  error: string;
  loaded: boolean;
} {
  const [connection, setConnection] = useState<IntegrationConnection>(null);
  const [loaded, setLoaded] = useState(false);
  const [connectingSystem, setConnectingSystem] = useState<string | null>(null);
  const [failedSystem, setFailedSystem] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chooserFor, setChooserFor] = useState<VendorOption | null>(null);
  const [chooserMethods, setChooserMethods] = useState<ConnectMethod[] | null>(null);
  const [error, setError] = useState("");
  // A "pending" row can be stuck forever with nothing to unstick it: Composio's
  // own INITIALIZING status doesn't reliably self-expire, and there was
  // previously no way to retry once status left "failed" territory — the
  // button just showed a permanent spinner. Retrying is safe even mid-pending
  // (calling connect again supersedes/expires whatever attempt was stuck), so
  // offer it once enough time has passed that this clearly isn't still the
  // few-seconds-normal OAuth round trip.
  const [stuckPending, setStuckPending] = useState(false);
  const isPending = connection?.status === "pending";

  useEffect(() => {
    getIntegrationConnection(integrationType)
      .then((row) => setConnection(row))
      .catch(() => setError(`Could not load ${title} connection status.`))
      .finally(() => setLoaded(true));
  }, [integrationType, title]);

  useEffect(() => {
    if (connection?.status !== "pending") return;
    const interval = setInterval(() => {
      getIntegrationConnection(integrationType)
        .then((row) => setConnection(row))
        .catch(() => setError(`Could not load ${title} connection status.`));
    }, 3000);
    return () => clearInterval(interval);
  }, [connection?.status, integrationType, title]);

  // Keyed on entering/leaving "pending", not on each poll tick that still
  // returns "pending" — otherwise every poll would restart the clock and
  // "stuck" could never be reached.
  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setStuckPending(true), STUCK_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setStuckPending(false);
    };
  }, [isPending]);

  async function handleConnect(vendor: VendorOption, authMethod?: "api_key" | "client_credentials") {
    setChooserFor(null);
    setError("");
    setFailedSystem(null);
    setConnectingSystem(vendor.system);
    try {
      const { redirectUrl } = await connectIntegration(integrationType, vendor.system, authMethod);
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }
      // Composio already had an active account for this vendor (e.g. one made
      // outside this app's own tracking) — the backend adopted it directly
      // instead of starting a new OAuth round trip, so just refresh status.
      const row = await getIntegrationConnection(integrationType);
      setConnection(row);
      setConnectingSystem(null);
    } catch (err) {
      setConnectingSystem(null);
      setFailedSystem(vendor.system);
      setError(err instanceof Error ? err.message : `Could not start ${vendor.label} connection.`);
    }
  }

  /** Asks which ways this server has set up. With only the usual sign-in, there is nothing to choose. */
  async function openChooser(vendor: VendorOption) {
    setError("");
    setChooserMethods(null);
    setChooserFor(vendor);
    try {
      const { methods } = await getConnectMethods(integrationType, vendor.system);
      if (methods.length <= 1) {
        await handleConnect(vendor);
        return;
      }
      setChooserMethods(methods);
    } catch {
      await handleConnect(vendor);
    }
  }

  async function handleDisconnect(vendorLabel: string) {
    setError("");
    setDisconnecting(true);
    try {
      await disconnectIntegration(integrationType);
      setConnection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not disconnect ${vendorLabel}.`);
    } finally {
      setDisconnecting(false);
    }
  }

  const activeSystem = connection?.status === "active" || connection?.status === "pending" ? connection.system : null;

  const states: VendorState[] = vendors.map((vendor) => {
    const isActiveSlot = activeSystem === vendor.system;
    const status: IntegrationCardStatus = !loaded
      ? "disconnected"
      : isActiveSlot && connection?.status === "active"
        ? "connected"
        : isActiveSlot && connection?.status === "pending"
          ? "pending"
          : failedSystem === vendor.system
            ? "failed"
            : activeSystem
              ? "unavailable"
              : "disconnected";
    const note =
      status === "unavailable"
        ? `Disconnect ${vendors.find((v) => v.system === activeSystem)?.label ?? "the current connection"} first to switch.`
        : status === "pending"
          ? stuckPending
            ? "This is taking a while. Try again."
            : `Finish signing in to ${vendor.label} in the popup or redirected tab.`
          : status === "failed"
            ? "The previous attempt failed. Try again."
            : status === "connected" && hasConnectionSettings(connection)
              ? connectionSettingsNote(connection)
              : undefined;
    const connectLabel =
      status === "connected" || status === "unavailable"
        ? undefined
        : status === "pending" && !stuckPending
          ? "Connecting…"
          : status === "failed" || stuckPending
            ? `Retry connecting ${vendor.label}`
            : `Connect ${vendor.label}`;
    return {
      vendor,
      integrationType,
      category: title,
      description: vendor.description ?? description,
      status,
      note,
      connectLabel,
      connect: () => (API_KEY_SYSTEMS.has(vendor.system) ? void openChooser(vendor) : void handleConnect(vendor)),
      connecting: connectingSystem === vendor.system || (status === "pending" && !stuckPending),
      busy: connectingSystem !== null,
      disconnect: () => handleDisconnect(vendor.label),
      disconnecting,
      openSettings: status === "connected" && hasConnectionSettings(connection) ? () => setSettingsOpen(true) : undefined,
    };
  });

  const dialogs = (
    <>
      {connection?.status === "active" && hasConnectionSettings(connection) && (
        <ConnectionSettingsDialog
          integrationType={integrationType}
          connection={connection}
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={setConnection}
        />
      )}
      <ConnectMethodDialog
        label={chooserFor?.label ?? ""}
        methods={chooserMethods}
        isOpen={chooserFor !== null}
        onClose={() => setChooserFor(null)}
        onChoose={(method: ConnectMethod) => {
          if (chooserFor) void handleConnect(chooserFor, method === "oauth" ? undefined : method);
        }}
      />
    </>
  );

  return { vendors: states, dialogs, error, loaded };
}
