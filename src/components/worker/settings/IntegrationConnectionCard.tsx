"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { cardClass } from "@/components/worker/settings/ui";
import {
  connectIntegration,
  disconnectIntegration,
  getIntegrationConnection,
  type IntegrationConnection,
} from "@/lib/worker-api";

export type VendorOption = { system: string; label: string };

type IntegrationConnectionCardProps = {
  integrationType: string;
  vendors: VendorOption[];
  title: string;
  description: string;
};

export default function IntegrationConnectionCard({
  integrationType,
  vendors,
  title,
  description,
}: IntegrationConnectionCardProps) {
  const [connection, setConnection] = useState<IntegrationConnection>(null);
  const [loaded, setLoaded] = useState(false);
  const [connectingSystem, setConnectingSystem] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");

  const labelFor = (system: string | undefined) =>
    (vendors ?? []).find((vendor) => vendor.system === system)?.label ?? system ?? title;

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

  async function handleConnect(system: string) {
    const vendorLabel = labelFor(system);
    setError("");
    setConnectingSystem(system);
    try {
      const { redirectUrl } = await connectIntegration(integrationType, system);
      window.location.href = redirectUrl;
    } catch (err) {
      setConnectingSystem(null);
      setError(err instanceof Error ? err.message : `Could not start ${vendorLabel} connection.`);
    }
  }

  async function handleDisconnect() {
    setError("");
    setDisconnecting(true);
    try {
      await disconnectIntegration(integrationType);
      setConnection(null);
    } catch (err) {
      const vendorLabel = labelFor(connection?.system);
      setError(err instanceof Error ? err.message : `Could not disconnect ${vendorLabel}.`);
    } finally {
      setDisconnecting(false);
    }
  }

  const status = connection?.status;
  const showConnect = !connection || status === "disabled" || status === "failed";
  const pending = status === "pending";
  const active = status === "active";
  const connectedLabel = labelFor(connection?.system);
  const connecting = connectingSystem !== null;

  return (
    <section className={cardClass}>
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>

      {!loaded ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Checking connection…</p>
      ) : active ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-gray-800 dark:text-white/90">Connected to {connectedLabel}</p>
          <Badge size="sm" color="success">
            Connected
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleDisconnect()}
            loading={disconnecting}
            disabled={disconnecting}
          >
            Disconnect
          </Button>
        </div>
      ) : pending ? (
        <div className="mt-4">
          <Badge size="sm" color="warning">
            Connecting…
          </Badge>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Finish signing in to {connectedLabel} in the popup or redirected tab, then return here. This page will update
            when the connection is active.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
            Not connected
          </span>
          {showConnect &&
            vendors.map((vendor) => (
              <Button
                key={vendor.system}
                size="sm"
                onClick={() => void handleConnect(vendor.system)}
                loading={connectingSystem === vendor.system}
                disabled={connecting}
              >
                Connect {vendor.label}
              </Button>
            ))}
        </div>
      )}

      {status === "failed" && (
        <p className="mt-2 text-sm text-error-600 dark:text-error-400">
          The previous connection attempt failed. Try connecting again.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-error-600 dark:text-error-400">{error}</p>}
    </section>
  );
}
