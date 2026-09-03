import React from "react";
import AgentAvatar, { AgentName } from "@/components/aix/AgentAvatar";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Handoff {
  time: string;
  agent: AgentName;
  account: string;
  reason: string;
  status: "Accepted" | "Pending" | "Resolved";
}

const handoffs: Handoff[] = [
  {
    time: "12 min ago",
    agent: "Pepper",
    account: "Meridian Logistics",
    reason: "Pricing exception requested",
    status: "Pending",
  },
  {
    time: "38 min ago",
    agent: "Tony",
    account: "Corewave Systems",
    reason: "Custom API integration scope",
    status: "Accepted",
  },
  {
    time: "1 hr ago",
    agent: "Jules",
    account: "Brightpath Medical",
    reason: "Buyer asked for an executive call",
    status: "Accepted",
  },
  {
    time: "3 hrs ago",
    agent: "George",
    account: "Fairmont Industrial",
    reason: "Renewal risk flagged",
    status: "Resolved",
  },
  {
    time: "Yesterday",
    agent: "Joy",
    account: "Trellis Freight",
    reason: "Contract redline review",
    status: "Resolved",
  },
];

const statusColor: Record<Handoff["status"], "success" | "warning" | "light"> =
  {
    Accepted: "success",
    Pending: "warning",
    Resolved: "light",
  };

export default function RecentHandoffs() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-1 px-5 pt-5 md:px-6 md:pt-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Recent handoffs
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Conversations agents escalated to your team
        </p>
      </div>
      {/* Mobile: list — no horizontal scroll. */}
      <div className="mt-4 space-y-3 px-5 pb-5 md:hidden">
        {handoffs.map((handoff) => (
          <div
            key={`${handoff.account}-${handoff.time}`}
            className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <div className="flex min-w-0 items-start gap-3">
              <AgentAvatar name={handoff.agent} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {handoff.account}
                </p>
                <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
                  {handoff.agent} &middot; {handoff.time}
                </p>
                <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                  {handoff.reason}
                </p>
              </div>
            </div>
            <span className="shrink-0">
              <Badge size="sm" variant="light" color={statusColor[handoff.status]}>
                {handoff.status}
              </Badge>
            </span>
          </div>
        ))}
      </div>
      <div className="custom-scrollbar mt-4 hidden max-w-full overflow-x-auto px-5 pb-5 md:block md:px-6 md:pb-6">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow className="border-b border-gray-100 dark:border-gray-800">
              <TableCell
                isHeader
                className="py-3 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Time
              </TableCell>
              <TableCell
                isHeader
                className="py-3 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Agent
              </TableCell>
              <TableCell
                isHeader
                className="py-3 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Account
              </TableCell>
              <TableCell
                isHeader
                className="py-3 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Reason
              </TableCell>
              <TableCell
                isHeader
                className="py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Status
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {handoffs.map((handoff) => (
              <TableRow
                key={`${handoff.account}-${handoff.time}`}
                className="border-b border-gray-100 last:border-0 dark:border-gray-800"
              >
                <TableCell className="whitespace-nowrap py-3.5 pr-4 text-sm text-gray-500 dark:text-gray-400">
                  {handoff.time}
                </TableCell>
                <TableCell className="whitespace-nowrap py-3.5 pr-4">
                  <span className="flex items-center gap-2">
                    <AgentAvatar name={handoff.agent} size="sm" />
                    <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {handoff.agent}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap py-3.5 pr-4 text-sm text-gray-800 dark:text-white/90">
                  {handoff.account}
                </TableCell>
                <TableCell className="py-3.5 pr-4 text-sm text-gray-500 dark:text-gray-400">
                  {handoff.reason}
                </TableCell>
                <TableCell className="whitespace-nowrap py-3.5">
                  <Badge
                    size="sm"
                    variant="light"
                    color={statusColor[handoff.status]}
                  >
                    {handoff.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
