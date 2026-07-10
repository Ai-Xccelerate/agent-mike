import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";

type Outcome = "Qualified" | "Routed to support" | "Self-served" | "Escalated";

interface Conversation {
  visitor: string;
  topic: string;
  outcome: Outcome;
  duration: string;
  time: string;
}

const conversations: Conversation[] = [
  { visitor: "kelly@meridianlog.com", topic: "Pricing for 3 AI employees", outcome: "Qualified", duration: "4m 12s", time: "6 min ago" },
  { visitor: "Visitor #8841", topic: "How does onboarding work?", outcome: "Self-served", duration: "1m 48s", time: "22 min ago" },
  { visitor: "j.tan@summitpkg.com", topic: "CRM integration question", outcome: "Routed to support", duration: "3m 05s", time: "51 min ago" },
  { visitor: "Visitor #8836", topic: "Security & data handling", outcome: "Escalated", duration: "6m 40s", time: "1 hr ago" },
  { visitor: "amara@vectorfield.io", topic: "Book a demo for the team", outcome: "Qualified", duration: "2m 57s", time: "2 hrs ago" },
  { visitor: "Visitor #8812", topic: "Difference vs. a chatbot", outcome: "Self-served", duration: "2m 10s", time: "3 hrs ago" },
];

const outcomeBadgeColor: Record<
  Outcome,
  "success" | "info" | "light" | "warning"
> = {
  Qualified: "success",
  "Routed to support": "info",
  "Self-served": "light",
  Escalated: "warning",
};

const headerCellClass =
  "px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400";
const cellClass = "px-5 py-4 text-sm";

export default function RecentConversationsTable() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Recent conversations
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Handled by Pepper across chat and email
        </p>
      </div>
      {/* Mobile: list — no horizontal scroll. */}
      <div className="mt-4 space-y-2.5 px-5 pb-5 md:hidden">
        {conversations.map((conversation) => (
          <div
            key={`${conversation.visitor}-${conversation.time}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {conversation.visitor}
              </p>
              <p className="mt-0.5 truncate text-theme-xs text-gray-500 dark:text-gray-400">
                {conversation.topic}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Badge size="sm" color={outcomeBadgeColor[conversation.outcome]}>
                {conversation.outcome}
              </Badge>
              <p className="mt-1 whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
                {conversation.duration} &middot; {conversation.time}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden max-w-full overflow-x-auto md:block">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className={headerCellClass}>Visitor</TableCell>
              <TableCell isHeader className={headerCellClass}>Topic</TableCell>
              <TableCell isHeader className={headerCellClass}>Outcome</TableCell>
              <TableCell isHeader className={headerCellClass}>Duration</TableCell>
              <TableCell isHeader className={headerCellClass}>Time</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {conversations.map((conversation) => (
              <TableRow key={`${conversation.visitor}-${conversation.time}`}>
                <TableCell className={`${cellClass} whitespace-nowrap font-medium text-gray-800 dark:text-white/90`}>
                  {conversation.visitor}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                  {conversation.topic}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap`}>
                  <Badge size="sm" color={outcomeBadgeColor[conversation.outcome]}>
                    {conversation.outcome}
                  </Badge>
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                  {conversation.duration}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                  {conversation.time}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
