"use client";

import React from "react";
import DataTableOne, { Column } from "@/components/tables/DataTable/DataTableOne";
import Badge from "@/components/ui/badge/Badge";
import AgentAvatar from "@/components/aix/AgentAvatar";

type Priority = "Urgent" | "High" | "Normal";
type TicketStatus = "Open" | "Pending" | "Resolved";
type Handler = { kind: "agent" } | { kind: "human"; name: string; initials: string };

interface Ticket extends Record<string, unknown> {
  ticket: string;
  subject: string;
  requester: string;
  company: string;
  handledBy: string;
  handler: Handler;
  priority: Priority;
  status: TicketStatus;
  updated: string;
}

const tony: Handler = { kind: "agent" };
const human = (name: string, initials: string): Handler => ({ kind: "human", name, initials });

const data: Ticket[] = [
  { ticket: "TKT-2481", subject: "Webhook deliveries failing since API key rotation", requester: "Dana Whitmore", company: "Meridian Logistics", handledBy: "Tony", handler: tony, priority: "Urgent", status: "Open", updated: "4 min ago" },
  { ticket: "TKT-2480", subject: "Pepper not syncing inbound leads to HubSpot", requester: "Marcus Bell", company: "Northwind Supply", handledBy: "Tony", handler: tony, priority: "High", status: "Open", updated: "18 min ago" },
  { ticket: "TKT-2479", subject: "SSO login loop on the analytics dashboard", requester: "Priya Raman", company: "Cascade Medical", handledBy: "Sarah Kim", handler: human("Sarah Kim", "SK"), priority: "Urgent", status: "Pending", updated: "32 min ago" },
  { ticket: "TKT-2478", subject: "Rate limit questions for the enrichment endpoint", requester: "Tom Okafor", company: "Brightline Freight", handledBy: "Tony", handler: tony, priority: "Normal", status: "Resolved", updated: "1 hr ago" },
  { ticket: "TKT-2477", subject: "Jules sequences paused after domain warmup change", requester: "Elena Vasquez", company: "Harbor Analytics", handledBy: "Tony", handler: tony, priority: "High", status: "Pending", updated: "2 hr ago" },
  { ticket: "TKT-2476", subject: "Sandbox environment access for new admin", requester: "Chris Duong", company: "Meridian Logistics", handledBy: "Dev Patel", handler: human("Dev Patel", "DP"), priority: "Normal", status: "Open", updated: "3 hr ago" },
  { ticket: "TKT-2475", subject: "George's renewal reminders firing twice", requester: "Amara Osei", company: "Silverpine Software", handledBy: "Tony", handler: tony, priority: "High", status: "Resolved", updated: "5 hr ago" },
  { ticket: "TKT-2474", subject: "CSV export missing custom fields", requester: "Jake Moreno", company: "Redstone Manufacturing", handledBy: "Tony", handler: tony, priority: "Normal", status: "Resolved", updated: "Yesterday" },
  { ticket: "TKT-2473", subject: "Salesforce OAuth token keeps expiring early", requester: "Lindsey Park", company: "Cascade Medical", handledBy: "Sarah Kim", handler: human("Sarah Kim", "SK"), priority: "Urgent", status: "Pending", updated: "Yesterday" },
  { ticket: "TKT-2472", subject: "How to add a second workspace for EU team", requester: "Oliver Grant", company: "Atlas Components", handledBy: "Tony", handler: tony, priority: "Normal", status: "Resolved", updated: "Yesterday" },
  { ticket: "TKT-2471", subject: "Nick's demand-gen reports showing stale data", requester: "Fatima Noor", company: "Northwind Supply", handledBy: "Tony", handler: tony, priority: "High", status: "Open", updated: "2 days ago" },
  { ticket: "TKT-2470", subject: "Billing contact update and invoice re-send", requester: "Greg Hollis", company: "Brightline Freight", handledBy: "Maya Chen", handler: human("Maya Chen", "MC"), priority: "Normal", status: "Resolved", updated: "2 days ago" },
  { ticket: "TKT-2469", subject: "IP allowlist for on-prem data connector", requester: "Ruth Adler", company: "Redstone Manufacturing", handledBy: "Dev Patel", handler: human("Dev Patel", "DP"), priority: "High", status: "Pending", updated: "3 days ago" },
  { ticket: "TKT-2468", subject: "Joy's deal-desk approvals stuck in review", requester: "Sam Whitaker", company: "Silverpine Software", handledBy: "Tony", handler: tony, priority: "Normal", status: "Resolved", updated: "3 days ago" },
  { ticket: "TKT-2467", subject: "API docs link broken in onboarding email", requester: "Nina Kowalski", company: "Harbor Analytics", handledBy: "Tony", handler: tony, priority: "Normal", status: "Resolved", updated: "4 days ago" },
];

const priorityColor: Record<Priority, "error" | "warning" | "light"> = {
  Urgent: "error",
  High: "warning",
  Normal: "light",
};

const statusColor: Record<TicketStatus, "primary" | "warning" | "success"> = {
  Open: "primary",
  Pending: "warning",
  Resolved: "success",
};

function HandledBy({ handler, name }: { handler: Handler; name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {handler.kind === "agent" ? (
        <AgentAvatar name="Tony" size="sm" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {handler.initials}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{name}</p>
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">
          {handler.kind === "agent" ? "AI technical agent" : "Support engineer"}
        </p>
      </div>
    </div>
  );
}

const columns: Column<Ticket>[] = [
  {
    key: "ticket",
    header: "Ticket",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-theme-xs font-medium text-gray-500 dark:text-gray-400">
        {row.ticket}
      </span>
    ),
  },
  {
    key: "subject",
    header: "Subject",
    sortable: true,
    render: (row) => (
      <span className="block max-w-72 truncate font-medium text-gray-800 dark:text-white/90">
        {row.subject}
      </span>
    ),
  },
  {
    key: "company",
    header: "Requester",
    sortable: true,
    render: (row) => (
      <div>
        <p className="text-sm text-gray-700 dark:text-gray-300">{row.requester}</p>
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">{row.company}</p>
      </div>
    ),
  },
  {
    key: "handledBy",
    header: "Handled by",
    sortable: true,
    render: (row) => <HandledBy handler={row.handler} name={row.handledBy} />,
  },
  {
    key: "priority",
    header: "Priority",
    sortable: true,
    render: (row) => (
      <Badge variant="light" size="sm" color={priorityColor[row.priority]}>
        {row.priority}
      </Badge>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (row) => (
      <Badge variant="light" size="sm" color={statusColor[row.status]}>
        {row.status}
      </Badge>
    ),
  },
  { key: "updated", header: "Updated", sortable: false },
];

export default function TicketsTable() {
  return (
    <DataTableOne
      columns={columns}
      data={data}
      searchPlaceholder="Search tickets..."
    />
  );
}
