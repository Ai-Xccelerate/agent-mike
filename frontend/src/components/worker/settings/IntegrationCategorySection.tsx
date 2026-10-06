"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { IntegrationCard, IntegrationCategoryHeading, type IntegrationCardStatus } from "@/components/worker/settings/IntegrationCard";
import ConnectionSettingsDialog, {
  connectionSettingsNote,
  hasConnectionSettings,
} from "@/components/worker/settings/ConnectionSettingsForm";
import {
  connectIntegration,
  disconnectIntegration,
  getIntegrationConnection,
  type IntegrationConnection,
} from "@/lib/worker-api";

export type VendorOption = { system: string; label: string; icon: ReactNode };

type IntegrationCategorySectionProps = {
  integrationType: string;
  vendors: VendorOption[];
  title: string;
  description: string;
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

export default function IntegrationCategorySection({
  integrationType,
  vendors,
  title,
  description,
}: IntegrationCategorySectionProps) {
  const [connection, setConnection] = useState<IntegrationConnection>(null);
  const [loaded, setLoaded] = useState(false);
  const [connectingSystem, setConnectingSystem] = useState<string | null>(null);
  const [failedSystem, setFailedSystem] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  async function handleConnect(vendor: VendorOption) {
    setError("");
    setFailedSystem(null);
    setConnectingSystem(vendor.system);
    try {
      const { redirectUrl } = await connectIntegration(integrationType, vendor.system);
      if (redirectUrl) {
        window.location.href = redirectUrl;
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

  return (
    <section>
      <IntegrationCategoryHeading title={title} description={description} />
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(260px,320px))]">
        {vendors.map((vendor) => {
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

          const action =
            status === "connected" ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => void handleDisconnect(vendor.label)}
                loading={disconnecting}
                disabled={disconnecting}
              >
                Disconnect
              </Button>
            ) : status === "pending" && !stuckPending ? (
              <Button size="sm" className="w-full" disabled loading>
                Connecting…
              </Button>
            ) : status === "unavailable" ? undefined : (
              <Button
                size="sm"
                className="w-full"
                onClick={() => void handleConnect(vendor)}
                loading={connectingSystem === vendor.system}
                disabled={connectingSystem !== null}
              >
                {status === "failed" || stuckPending ? `Retry connecting ${vendor.label}` : `Connect ${vendor.label}`}
              </Button>
            );

          return (
            <IntegrationCard
              key={vendor.system}
              icon={vendor.icon}
              title={vendor.label}
              description={description}
              status={status}
              note={note}
              action={action}
              onSettings={
                status === "connected" && hasConnectionSettings(connection) ? () => setSettingsOpen(true) : undefined
              }
            />
          );
        })}
      </div>
      {connection?.status === "active" && hasConnectionSettings(connection) && (
        <ConnectionSettingsDialog
          integrationType={integrationType}
          connection={connection}
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={setConnection}
        />
      )}
      {error && <p className="mt-2 text-xs font-medium text-error-600 dark:text-error-400">{error}</p>}
    </section>
  );
}
