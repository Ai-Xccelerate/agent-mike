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

function vendorLabel(system: string) {
  if (system === "zoho") return "Zoho";
  return system;
}

export default function CrmConnectionCard() {
  const [connection, setConnection] = useState<IntegrationConnection>(null);
  const [loaded, setLoaded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getIntegrationConnection("crm")
      .then((row) => setConnection(row))
      .catch(() => setError("Could not load CRM connection status."))
      .finally(() => setLoaded(true));
  }, []);

  async function connectZoho() {
    setError("");
    setConnecting(true);
    try {
      const { redirectUrl } = await connectIntegration("crm", "zoho");
      window.location.href = redirectUrl;
    } catch (err) {
      setConnecting(false);
      setError(err instanceof Error ? err.message : "Could not start Zoho connection.");
    }
  }

  async function disconnectCrm() {
    setError("");
    setDisconnecting(true);
    try {
      await disconnectIntegration("crm");
      setConnection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect CRM.");
    } finally {
      setDisconnecting(false);
    }
  }

  const status = connection?.status;
  const showConnect = !connection || status === "disabled" || status === "failed";
  const pending = status === "pending";
  const active = status === "active";
  const vendor = vendorLabel(connection?.system ?? "zoho");

  return (
    <section className={cardClass}>
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Business system of record</h2>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
        CRM, helpdesk, ticketing, or project-management tool — always a decoupled, external integration, never
        hard-coded into the worker.
      </p>

      {!loaded ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Checking connection…</p>
      ) : active ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-gray-800 dark:text-white/90">Connected to {vendor}</p>
          <Badge size="sm" color="success">
            Connected
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void disconnectCrm()}
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
            Finish signing in to {vendor} in the popup or redirected tab, then return here. This page will update
            when the connection is active.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
            Not connected
          </span>
          {showConnect && (
            <Button size="sm" onClick={() => void connectZoho()} loading={connecting} disabled={connecting}>
              Connect Zoho
            </Button>
          )}
        </div>
      )}

      {status === "failed" && (
        <p className="mt-2 text-sm text-error-600 dark:text-error-400">The previous connection attempt failed. Try connecting again.</p>
      )}
      {error && <p className="mt-2 text-sm text-error-600 dark:text-error-400">{error}</p>}
    </section>
  );
}
