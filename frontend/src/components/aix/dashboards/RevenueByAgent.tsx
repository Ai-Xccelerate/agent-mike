import React from "react";
import AgentAvatar, {
  AGENT_META,
  AgentName,
} from "@/components/aix/AgentAvatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AgentRevenue {
  agent: AgentName;
  influenced: string;
  deals: number;
  share: string;
}

const rows: AgentRevenue[] = [
  { agent: "Jules", influenced: "$486K", deals: 14, share: "25.6%" },
  { agent: "Pepper", influenced: "$412K", deals: 12, share: "21.7%" },
  { agent: "Nick", influenced: "$389K", deals: 11, share: "20.5%" },
  { agent: "George", influenced: "$284K", deals: 8, share: "14.9%" },
  { agent: "Joy", influenced: "$196K", deals: 6, share: "10.3%" },
  { agent: "Tony", influenced: "$133K", deals: 4, share: "7.0%" },
];

export default function RevenueByAgent() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-1 px-5 pt-5 md:px-6 md:pt-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Revenue by agent
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Influenced revenue this quarter
        </p>
      </div>
      {/* Mobile: agent list — no horizontal scroll. */}
      <div className="mt-4 space-y-2.5 px-5 pb-5 md:hidden">
        {rows.map((row) => (
          <div
            key={row.agent}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <div className="flex min-w-0 items-center gap-3">
              <AgentAvatar name={row.agent} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {row.agent}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {AGENT_META[row.agent].role}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
                {row.influenced}
              </p>
              <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {row.deals} deals · {row.share}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="custom-scrollbar mt-4 hidden max-w-full overflow-x-auto px-5 pb-5 md:block md:px-6 md:pb-6">
        <Table className="min-w-[440px]">
          <TableHeader>
            <TableRow className="border-b border-gray-100 dark:border-gray-800">
              <TableCell
                isHeader
                className="py-3 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Agent
              </TableCell>
              <TableCell
                isHeader
                className="py-3 pr-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Influenced
              </TableCell>
              <TableCell
                isHeader
                className="py-3 pr-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Deals
              </TableCell>
              <TableCell
                isHeader
                className="py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Share
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.agent}
                className="border-b border-gray-100 last:border-0 dark:border-gray-800"
              >
                <TableCell className="whitespace-nowrap py-3.5 pr-4">
                  <span className="flex items-center gap-3">
                    <AgentAvatar name={row.agent} size="sm" />
                    <span>
                      <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                        {row.agent}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {AGENT_META[row.agent].role}
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap py-3.5 pr-4 text-right text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
                  {row.influenced}
                </TableCell>
                <TableCell className="whitespace-nowrap py-3.5 pr-4 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                  {row.deals}
                </TableCell>
                <TableCell className="whitespace-nowrap py-3.5 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                  {row.share}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
