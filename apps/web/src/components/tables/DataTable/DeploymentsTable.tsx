"use client";

import React from "react";
import DataTableOne, { Column, TableView } from "./DataTableOne";
import Badge from "@/components/ui/badge/Badge";

interface Deployment extends Record<string, unknown> {
  agent: string;
  role: string;
  account: string;
  conversations: number;
  status: "Active" | "Training" | "Paused";
  updated: string;
}

const data: Deployment[] = [
  { agent: "Nick", role: "Demand Gen", account: "Acme Inc.", conversations: 1284, status: "Active", updated: "2 min ago" },
  { agent: "Jules", role: "Outbound", account: "Globex", conversations: 942, status: "Active", updated: "12 min ago" },
  { agent: "Pepper", role: "Inbound", account: "Initech", conversations: 611, status: "Training", updated: "1 hr ago" },
  { agent: "Tony", role: "Technical", account: "Umbrella", conversations: 388, status: "Active", updated: "3 hr ago" },
  { agent: "Joy", role: "Deal Ops", account: "Soylent", conversations: 205, status: "Paused", updated: "Yesterday" },
  { agent: "George", role: "Retention", account: "Hooli", conversations: 1477, status: "Active", updated: "5 min ago" },
  { agent: "Nick", role: "Demand Gen", account: "Vandelay", conversations: 733, status: "Training", updated: "40 min ago" },
  { agent: "Jules", role: "Outbound", account: "Stark Industries", conversations: 1102, status: "Active", updated: "8 min ago" },
  { agent: "Pepper", role: "Inbound", account: "Wonka Co.", conversations: 96, status: "Paused", updated: "2 days ago" },
  { agent: "Tony", role: "Technical", account: "Wayne Enterprises", conversations: 854, status: "Active", updated: "22 min ago" },
  { agent: "Joy", role: "Deal Ops", account: "Cyberdyne", conversations: 431, status: "Active", updated: "1 hr ago" },
  { agent: "George", role: "Retention", account: "Massive Dynamic", conversations: 267, status: "Training", updated: "6 hr ago" },
  { agent: "Nick", role: "Demand Gen", account: "Gringotts", conversations: 1890, status: "Active", updated: "just now" },
  { agent: "Jules", role: "Outbound", account: "Duff Brewing", conversations: 512, status: "Paused", updated: "3 days ago" },
  { agent: "Pepper", role: "Inbound", account: "Pied Piper", conversations: 1043, status: "Active", updated: "15 min ago" },
];

const statusColor: Record<Deployment["status"], "success" | "warning" | "light"> = {
  Active: "success",
  Training: "warning",
  Paused: "light",
};

const columns: Column<Deployment>[] = [
  { key: "agent", header: "Agent", sortable: true },
  { key: "role", header: "Role", sortable: true },
  { key: "account", header: "Account", sortable: true },
  {
    key: "conversations",
    header: "Conversations",
    sortable: true,
    render: (row) => (
      <span className="tabular-nums">
        {row.conversations.toLocaleString("en-US")}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (row) => (
      <Badge variant="light" color={statusColor[row.status]}>
        {row.status}
      </Badge>
    ),
  },
  { key: "updated", header: "Last Active", sortable: false },
];

const views: TableView<Deployment>[] = [
  { label: "All deployments" },
  { label: "Active", filter: (r) => r.status === "Active" },
  { label: "Training", filter: (r) => r.status === "Training" },
  { label: "Paused", filter: (r) => r.status === "Paused" },
];

export default function DeploymentsTable() {
  return (
    <DataTableOne
      columns={columns}
      data={data}
      views={views}
      searchPlaceholder="Search deployments..."
    />
  );
}
