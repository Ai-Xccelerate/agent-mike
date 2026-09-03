import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";

type MeetingType = "Discovery" | "Demo" | "Follow-up";

interface Meeting {
  prospect: string;
  title: string;
  company: string;
  when: string;
  type: MeetingType;
}

const meetings: Meeting[] = [
  { prospect: "Elena Vasquez", title: "VP Operations", company: "Redline Distribution", when: "Today, 2:30 PM", type: "Discovery" },
  { prospect: "David Kim", title: "CFO", company: "Summit Packaging", when: "Today, 4:00 PM", type: "Demo" },
  { prospect: "Rachel Nguyen", title: "RevOps Lead", company: "Atlas Freight Co.", when: "Tomorrow, 10:00 AM", type: "Follow-up" },
  { prospect: "Michael Osei", title: "CEO", company: "Northgate Industrial", when: "Tomorrow, 1:30 PM", type: "Discovery" },
  { prospect: "Laura Bennett", title: "Sales Director", company: "Crestview Medical", when: "Mon Jul 7, 9:00 AM", type: "Demo" },
  { prospect: "Anil Mehta", title: "COO", company: "Pinnacle Supply Chain", when: "Mon Jul 7, 3:00 PM", type: "Discovery" },
];

const typeBadgeColor: Record<MeetingType, "info" | "success" | "light"> = {
  Discovery: "info",
  Demo: "success",
  "Follow-up": "light",
};

const headerCellClass =
  "px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400";
const cellClass = "px-5 py-4 text-sm";

export default function UpcomingMeetingsTable() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Upcoming meetings
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Booked by Jules and synced to the team calendar
        </p>
      </div>
      {/* Mobile: list — no horizontal scroll. */}
      <div className="mt-4 space-y-2.5 px-5 pb-5 md:hidden">
        {meetings.map((meeting) => (
          <div
            key={`${meeting.prospect}-${meeting.when}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {meeting.prospect}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {meeting.title} &middot; {meeting.company}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {meeting.when}
              </p>
              <div className="mt-1 flex justify-end">
                <Badge size="sm" color={typeBadgeColor[meeting.type]}>
                  {meeting.type}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 hidden max-w-full overflow-x-auto md:block">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className={headerCellClass}>Prospect</TableCell>
              <TableCell isHeader className={headerCellClass}>Company</TableCell>
              <TableCell isHeader className={headerCellClass}>When</TableCell>
              <TableCell isHeader className={headerCellClass}>Type</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {meetings.map((meeting) => (
              <TableRow key={`${meeting.prospect}-${meeting.when}`}>
                <TableCell className={`${cellClass} whitespace-nowrap`}>
                  <p className="font-medium text-gray-800 dark:text-white/90">
                    {meeting.prospect}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {meeting.title}
                  </p>
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                  {meeting.company}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                  {meeting.when}
                </TableCell>
                <TableCell className={`${cellClass} whitespace-nowrap`}>
                  <Badge size="sm" color={typeBadgeColor[meeting.type]}>
                    {meeting.type}
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
