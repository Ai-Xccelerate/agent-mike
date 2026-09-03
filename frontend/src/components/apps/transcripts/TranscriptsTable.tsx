"use client";

import React from "react";
import Link from "next/link";
import DataTableOne, {
  Column,
} from "@/components/tables/DataTable/DataTableOne";
import Badge from "@/components/ui/badge/Badge";
import AgentAvatar, { AgentName } from "@/components/aix/AgentAvatar";

type Source = "Zoom" | "Meet" | "Teams";
type SyncStatus = "Synced" | "Processing";

type Participant =
  | { kind: "human"; name: string; initials: string }
  | { kind: "agent"; name: AgentName };

interface TranscriptRow {
  title: string;
  when: string;
  duration: string;
  participants: Participant[];
  source: Source;
  status: SyncStatus;
}

type Transcript = TranscriptRow & { open: string } & Record<string, unknown>;

const h = (name: string, initials: string): Participant => ({
  kind: "human",
  name,
  initials,
});
const agent = (name: AgentName): Participant => ({ kind: "agent", name });

const rows: TranscriptRow[] = [
  {
    title: "Acme Inc. — quarterly business review",
    when: "Today, 9:00 AM",
    duration: "47 min",
    participants: [h("Rahul Bhavsar", "RB"), h("Sarah Kim", "SK"), h("Dana Whitmore", "DW"), h("James Croft", "JC"), agent("Tony")],
    source: "Zoom",
    status: "Synced",
  },
  {
    title: "Pipeline sync with sales pod",
    when: "Today, 8:15 AM",
    duration: "26 min",
    participants: [h("Maya Chen", "MC"), h("Dev Patel", "DP"), h("Sarah Kim", "SK")],
    source: "Meet",
    status: "Processing",
  },
  {
    title: "Meridian onboarding kickoff",
    when: "Yesterday, 3:30 PM",
    duration: "52 min",
    participants: [h("Sarah Kim", "SK"), h("Priya Raman", "PR"), h("Chris Duong", "CD"), agent("Pepper")],
    source: "Teams",
    status: "Synced",
  },
  {
    title: "Weekly workforce standup",
    when: "Yesterday, 9:00 AM",
    duration: "18 min",
    participants: [h("Rahul Bhavsar", "RB"), h("Maya Chen", "MC"), h("Dev Patel", "DP"), h("Sarah Kim", "SK")],
    source: "Meet",
    status: "Synced",
  },
  {
    title: "Pricing exception review — Corewave",
    when: "Yesterday, 8:00 AM",
    duration: "31 min",
    participants: [h("Rahul Bhavsar", "RB"), h("Maya Chen", "MC")],
    source: "Zoom",
    status: "Synced",
  },
  {
    title: "Northwind Supply renewal check-in",
    when: "Jul 2, 2:00 PM",
    duration: "38 min",
    participants: [h("Sarah Kim", "SK"), h("Marcus Bell", "MB"), agent("Pepper")],
    source: "Zoom",
    status: "Synced",
  },
  {
    title: "Cascade Medical technical deep dive",
    when: "Jul 2, 10:30 AM",
    duration: "64 min",
    participants: [h("Dev Patel", "DP"), h("Lindsey Park", "LP"), h("Priya Raman", "PR"), agent("Tony")],
    source: "Teams",
    status: "Synced",
  },
  {
    title: "Seed raise prep — deck walkthrough",
    when: "Jul 1, 4:00 PM",
    duration: "43 min",
    participants: [h("Rahul Bhavsar", "RB"), h("Maya Chen", "MC")],
    source: "Meet",
    status: "Processing",
  },
  {
    title: "Brightline Freight discovery call",
    when: "Jul 1, 11:00 AM",
    duration: "29 min",
    participants: [h("Sarah Kim", "SK"), h("Tom Okafor", "TO"), h("Greg Hollis", "GH")],
    source: "Zoom",
    status: "Synced",
  },
  {
    title: "Silverpine expansion scoping",
    when: "Jun 30, 1:30 PM",
    duration: "35 min",
    participants: [h("Rahul Bhavsar", "RB"), h("Amara Osei", "AO"), h("Sam Whitaker", "SW"), agent("Tony")],
    source: "Teams",
    status: "Synced",
  },
  {
    title: "Harbor Analytics outbound review",
    when: "Jun 30, 10:00 AM",
    duration: "22 min",
    participants: [h("Maya Chen", "MC"), h("Elena Vasquez", "EV")],
    source: "Meet",
    status: "Synced",
  },
  {
    title: "Redstone Manufacturing QBR prep",
    when: "Jun 27, 3:00 PM",
    duration: "41 min",
    participants: [h("Sarah Kim", "SK"), h("Jake Moreno", "JM"), h("Ruth Adler", "RA"), agent("Pepper")],
    source: "Zoom",
    status: "Synced",
  },
];

const data: Transcript[] = rows.map((r) => ({ ...r, open: "" }));

const sourceColor: Record<Source, "info" | "success" | "light"> = {
  Zoom: "info",
  Meet: "success",
  Teams: "light",
};

const statusColor: Record<SyncStatus, "success" | "warning"> = {
  Synced: "success",
  Processing: "warning",
};

function ParticipantStack({ participants }: { participants: Participant[] }) {
  const shown = participants.slice(0, 4);
  const extra = participants.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((p, i) =>
        p.kind === "agent" ? (
          <span
            key={i}
            title={p.name}
            className="rounded-full ring-2 ring-white dark:ring-gray-900"
          >
            <AgentAvatar name={p.name} size="sm" />
          </span>
        ) : (
          <span
            key={i}
            title={p.name}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 ring-2 ring-white dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-900"
          >
            {p.initials}
          </span>
        )
      )}
      {extra > 0 && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 ring-2 ring-white dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-900">
          +{extra}
        </span>
      )}
    </div>
  );
}

const columns: Column<Transcript>[] = [
  {
    key: "title",
    header: "Meeting",
    sortable: true,
    render: (row) => (
      <span className="block max-w-72 truncate font-medium text-gray-800 dark:text-white/90">
        {row.title}
      </span>
    ),
  },
  { key: "when", header: "Date", sortable: true },
  {
    key: "duration",
    header: "Duration",
    sortable: true,
    render: (row) => (
      <span className="text-gray-500 dark:text-gray-400">{row.duration}</span>
    ),
  },
  {
    key: "participants",
    header: "Participants",
    render: (row) => <ParticipantStack participants={row.participants} />,
  },
  {
    key: "source",
    header: "Source",
    sortable: true,
    render: (row) => (
      <Badge variant="light" size="sm" color={sourceColor[row.source]}>
        {row.source}
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
  {
    key: "open",
    header: "",
    render: () => (
      <Link
        href="/transcript-detail"
        className="text-sm font-medium text-brand-500 transition-colors duration-150 hover:text-brand-600"
      >
        Open
      </Link>
    ),
  },
];

export default function TranscriptsTable() {
  return (
    <DataTableOne
      columns={columns}
      data={data}
      searchPlaceholder="Search transcripts..."
    />
  );
}
