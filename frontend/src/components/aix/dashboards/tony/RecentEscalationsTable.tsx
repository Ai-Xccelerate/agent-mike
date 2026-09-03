import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";

type Priority = "Urgent" | "High" | "Medium" | "Low";

interface Escalation {
  ticket: string;
  account: string;
  issue: string;
  priority: Priority;
  time: string;
}

const escalations: Escalation[] = [
  {
    ticket: "TCK-4821",
    account: "Meridian Logistics",
    issue: "Bulk order API returning 429 despite enterprise quota",
    priority: "Urgent",
    time: "18 min ago",
  },
  {
    ticket: "TCK-4816",
    account: "Halvorsen Medical",
    issue: "SAML assertion rejected after IdP certificate rotation",
    priority: "High",
    time: "1 hr ago",
  },
  {
    ticket: "TCK-4809",
    account: "Crestline Manufacturing",
    issue: "Webhook retries duplicating invoices in NetSuite",
    priority: "High",
    time: "3 hrs ago",
  },
  {
    ticket: "TCK-4797",
    account: "Bluepeak Software",
    issue: "Sandbox data refresh stuck at 60% for two days",
    priority: "Medium",
    time: "Yesterday",
  },
  {
    ticket: "TCK-4790",
    account: "Orchard Supply Group",
    issue: "CSV export drops custom fields over 255 characters",
    priority: "Low",
    time: "Yesterday",
  },
  {
    ticket: "TCK-4784",
    account: "Tarrant Freight",
    issue: "OAuth refresh tokens expiring earlier than documented",
    priority: "Medium",
    time: "2 days ago",
  },
];

const priorityColor: Record<Priority, "error" | "warning" | "info" | "light"> =
  {
    Urgent: "error",
    High: "warning",
    Medium: "info",
    Low: "light",
  };

export default function RecentEscalationsTable() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 md:px-6 md:pt-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Recent escalations
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Tickets Tony handed to the human team with full context attached
        </p>
      </div>
      {/* Mobile: stacked cards — no horizontal scroll. */}
      <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
        {escalations.map((row) => (
          <div key={row.ticket} className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {row.ticket}
              </span>
              <Badge size="sm" color={priorityColor[row.priority]}>
                {row.priority}
              </Badge>
            </div>
            <dl className="mt-2 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Account
                </dt>
                <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                  {row.account}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">
                  Issue
                </dt>
                <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                  {row.issue}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Escalated
                </dt>
                <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                  {row.time}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <div className="custom-scrollbar mt-4 hidden max-w-full overflow-x-auto md:block">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell
                isHeader
                className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Ticket
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Account
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Issue
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Priority
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Escalated
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {escalations.map((row) => (
              <TableRow key={row.ticket}>
                <TableCell className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90 md:px-6">
                  {row.ticket}
                </TableCell>
                <TableCell className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {row.account}
                </TableCell>
                <TableCell className="max-w-[360px] truncate px-5 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {row.issue}
                </TableCell>
                <TableCell className="px-5 py-4 md:px-6">
                  <Badge size="sm" color={priorityColor[row.priority]}>
                    {row.priority}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {row.time}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
