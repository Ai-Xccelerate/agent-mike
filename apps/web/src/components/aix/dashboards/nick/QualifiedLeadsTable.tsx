import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";

interface QualifiedLead {
  name: string;
  company: string;
  source: string;
  score: number;
  time: string;
}

const leads: QualifiedLead[] = [
  { name: "Dana Whitfield", company: "Meridian Logistics", source: "LinkedIn", score: 92, time: "8 min ago" },
  { name: "Marcus Chen", company: "TruNorth Supply", source: "Webinar", time: "34 min ago", score: 88 },
  { name: "Priya Raman", company: "Coastal MedTech", source: "Landing page", score: 81, time: "1 hr ago" },
  { name: "Tom Alvarez", company: "Brightline Manufacturing", source: "Paid search", score: 74, time: "2 hrs ago" },
  { name: "Sarah Okafor", company: "Vector Field Services", source: "Email", score: 69, time: "3 hrs ago" },
  { name: "James Park", company: "Halcyon Freight", source: "LinkedIn", score: 63, time: "Yesterday" },
];

function scoreBadge(score: number) {
  if (score >= 85) {
    return <Badge size="sm" color="success">{score} · Hot</Badge>;
  }
  if (score >= 70) {
    return <Badge size="sm" color="warning">{score} · Warm</Badge>;
  }
  return <Badge size="sm" color="light">{score} · Nurture</Badge>;
}

const headerCellClass =
  "px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400";
const cellClass = "px-5 py-4 text-sm";

export default function QualifiedLeadsTable() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Latest qualified leads
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Scored and handed off by Nick
        </p>
      </div>
      {/* Mobile: list — no horizontal scroll. */}
      <div className="mt-4 space-y-2.5 px-5 pb-5 md:hidden">
        {leads.map((lead) => (
          <div
            key={lead.name}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {lead.name}
              </p>
              <p className="mt-0.5 truncate text-theme-xs text-gray-500 dark:text-gray-400">
                {lead.company} · {lead.source}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {scoreBadge(lead.score)}
              <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                {lead.time}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 hidden max-w-full overflow-x-auto md:block">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className={headerCellClass}>Name</TableCell>
              <TableCell isHeader className={headerCellClass}>Company</TableCell>
              <TableCell isHeader className={headerCellClass}>Source</TableCell>
              <TableCell isHeader className={headerCellClass}>Score</TableCell>
              <TableCell isHeader className={headerCellClass}>Received</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {leads.map((lead) => (
              <TableRow key={lead.name}>
                <TableCell className={`${cellClass} whitespace-nowrap font-medium text-gray-800 dark:text-white/90`}>
                  {lead.name}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                  {lead.company}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                  {lead.source}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap`}>
                  {scoreBadge(lead.score)}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                  {lead.time}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
