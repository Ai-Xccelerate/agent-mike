import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { DownloadIcon } from "@/icons";

type InvoiceStatus = "Paid" | "Pending";

interface BillingRow {
  invoice: string;
  date: string;
  amount: string;
  status: InvoiceStatus;
}

const history: BillingRow[] = [
  { invoice: "INV-2026-0142", date: "Jul 1, 2026", amount: "$6,000.00", status: "Pending" },
  { invoice: "INV-2026-0128", date: "Jun 1, 2026", amount: "$6,000.00", status: "Paid" },
  { invoice: "INV-2026-0114", date: "May 1, 2026", amount: "$6,000.00", status: "Paid" },
  { invoice: "INV-2026-0101", date: "Apr 1, 2026", amount: "$4,500.00", status: "Paid" },
  { invoice: "INV-2026-0087", date: "Mar 1, 2026", amount: "$4,500.00", status: "Paid" },
  { invoice: "INV-2026-0073", date: "Feb 1, 2026", amount: "$4,500.00", status: "Paid" },
];

const statusColor: Record<InvoiceStatus, "success" | "warning"> = {
  Paid: "success",
  Pending: "warning",
};

export default function BillingHistoryTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Billing history
        </h3>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Invoices for your AIX subscription.
        </p>
      </div>
      {/* Mobile: list — no horizontal scroll. */}
      <div className="space-y-3 px-5 py-4 md:hidden">
        {history.map((row) => (
          <div
            key={row.invoice}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {row.invoice}
              </p>
              <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                {row.date}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums text-gray-800 dark:text-white/90">
                  {row.amount}
                </p>
                <div className="mt-1">
                  <Badge variant="light" size="sm" color={statusColor[row.status]}>
                    {row.status}
                  </Badge>
                </div>
              </div>
              <a
                href="#"
                aria-label={`Download ${row.invoice}`}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-200"
              >
                <DownloadIcon className="size-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden max-w-full overflow-x-auto md:block">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-gray-800">
            <TableRow>
              {["Invoice", "Date", "Amount", "Status", ""].map((header, i) => (
                <TableCell
                  key={i}
                  isHeader
                  className="px-5 py-3 text-left text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.map((row) => (
              <TableRow
                key={row.invoice}
                className="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              >
                <TableCell className="px-5 py-4 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {row.invoice}
                </TableCell>
                <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">
                  {row.date}
                </TableCell>
                <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">
                  {row.amount}
                </TableCell>
                <TableCell className="px-5 py-4">
                  <Badge variant="light" size="sm" color={statusColor[row.status]}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="px-5 py-4 text-right">
                  <a
                    href="#"
                    aria-label={`Download ${row.invoice}`}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-200"
                  >
                    <DownloadIcon className="size-4" />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
