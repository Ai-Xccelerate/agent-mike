"use client";

import React from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import AgentAvatar from "@/components/aix/AgentAvatar";
import { UserIcon } from "@/icons";

export default function TicketHeader() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-theme-xs font-medium text-gray-500 dark:text-gray-400">
              TKT-2481
            </span>
            <Badge variant="light" size="sm" color="error">
              Urgent
            </Badge>
            <Badge variant="light" size="sm" color="primary">
              Open
            </Badge>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-gray-800 dark:text-white/90 md:text-xl">
            Webhook deliveries failing since API key rotation
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Dana Whitmore · Meridian Logistics · Opened 42 min ago via email
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <AgentAvatar name="Tony" size="sm" showStatus status="active" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Assigned to Tony
              </p>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                AI technical agent
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            startIcon={<UserIcon className="size-4" />}
          >
            Escalate to human
          </Button>
        </div>
      </div>
    </div>
  );
}
