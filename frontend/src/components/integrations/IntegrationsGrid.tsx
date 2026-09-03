"use client";
import React, { useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";

interface Integration {
  id: string;
  name: string;
  description: string;
  connected: boolean;
}

const integrations: Integration[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    description:
      "Sync accounts, log activities, and keep pipeline stages current.",
    connected: true,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description:
      "Two-way contact and deal sync for teams running on HubSpot CRM.",
    connected: false,
  },
  {
    id: "slack",
    name: "Slack",
    description:
      "Handoff alerts, daily digests, and approvals inside your channels.",
    connected: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description:
      "Send and receive from your own domain with full thread context.",
    connected: true,
  },
  {
    id: "linear",
    name: "Linear",
    description:
      "Create and track engineering escalations raised by your AI employees.",
    connected: false,
  },
  {
    id: "stripe",
    name: "Stripe",
    description:
      "Pull billing status into conversations and flag payment issues early.",
    connected: false,
  },
  {
    id: "zoom",
    name: "Zoom",
    description:
      "Book meetings on real availability and attach recordings to deals.",
    connected: true,
  },
  {
    id: "notion",
    name: "Notion",
    description:
      "Ground your agents in playbooks and docs kept in your workspace.",
    connected: false,
  },
];

export default function IntegrationsGrid() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      integrations.filter((i) => i.connected).map((i) => [i.id, true])
    )
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
      {integrations.map((integration) => (
        <div
          key={integration.id}
          className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 transition-colors duration-150 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700 md:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Neutral monogram — the green Connected badge is the only color
                  signal, keeping to one accent per view (brand rule). */}
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-base font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-300"
                aria-hidden="true"
              >
                {integration.name.charAt(0)}
              </span>
              <div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  {integration.name}
                </h3>
                {integration.connected && (
                  <Badge variant="light" color="success" size="sm">
                    Connected
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 flex-1 text-sm text-gray-500 dark:text-gray-400">
            {integration.description}
          </p>
          <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
            {integration.connected ? (
              <div className="flex items-center justify-between gap-3">
                <Switch
                  label={enabled[integration.id] ? "Enabled" : "Paused"}
                  defaultChecked={integration.connected}
                  onChange={(checked) =>
                    setEnabled((prev) => ({
                      ...prev,
                      [integration.id]: checked,
                    }))
                  }
                />
                <button className="text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-400 dark:hover:text-gray-200">
                  Manage
                </button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="w-full">
                Connect
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
