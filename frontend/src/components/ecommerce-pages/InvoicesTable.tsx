"use client";

import React from "react";
import Link from "next/link";
import DataTableOne, { Column } from "@/components/tables/DataTable/DataTableOne";
import Badge from "@/components/ui/badge/Badge";

type InvoiceStatus = "Paid" | "Pending" | "Overdue";

interface Invoice extends Record<string, unknown> {
  invoice: string;
  client: string;
  issued: string;
  due: string;
  amount: string;
  status: InvoiceStatus;
}

const invoices: Invoice[] = [
  { invoice: "INV-2026-0151", client: "Meridian Logistics", issued: "Jul 1, 2026", due: "Jul 15, 2026", amount: "$12,000.00", status: "Pending" },
  { invoice: "INV-2026-0150", client: "TrueNorth Medical", issued: "Jun 28, 2026", due: "Jul 12, 2026", amount: "$6,000.00", status: "Pending" },
  { invoice: "INV-2026-0147", client: "Copperline Industrial", issued: "Jun 15, 2026", due: "Jun 29, 2026", amount: "$4,500.00", status: "Overdue" },
  { invoice: "INV-2026-0145", client: "Halstead & Co.", issued: "Jun 10, 2026", due: "Jun 24, 2026", amount: "$18,000.00", status: "Paid" },
  { invoice: "INV-2026-0141", client: "Bluewater Freight", issued: "Jun 1, 2026", due: "Jun 15, 2026", amount: "$9,000.00", status: "Paid" },
  { invoice: "INV-2026-0138", client: "Summit Dental Group", issued: "May 22, 2026", due: "Jun 5, 2026", amount: "$7,500.00", status: "Paid" },
  { invoice: "INV-2026-0134", client: "Meridian Logistics", issued: "May 15, 2026", due: "May 29, 2026", amount: "$12,000.00", status: "Paid" },
  { invoice: "INV-2026-0129", client: "Ironclad Supply", issued: "May 8, 2026", due: "May 22, 2026", amount: "$4,000.00", status: "Paid" },
  { invoice: "INV-2026-0125", client: "TrueNorth Medical", issued: "May 1, 2026", due: "May 15, 2026", amount: "$6,000.00", status: "Paid" },
  { invoice: "INV-2026-0119", client: "Lakeshore Legal", issued: "Apr 24, 2026", due: "May 8, 2026", amount: "$3,500.00", status: "Paid" },
  { invoice: "INV-2026-0113", client: "Copperline Industrial", issued: "Apr 15, 2026", due: "Apr 29, 2026", amount: "$4,500.00", status: "Paid" },
  { invoice: "INV-2026-0108", client: "Halstead & Co.", issued: "Apr 8, 2026", due: "Apr 22, 2026", amount: "$25,000.00", status: "Paid" },
];

const statusColor: Record<InvoiceStatus, "success" | "warning" | "error"> = {
  Paid: "success",
  Pending: "warning",
  Overdue: "error",
};

const columns: Column<Invoice>[] = [
  {
    key: "invoice",
    header: "Invoice",
    sortable: true,
    render: (row) => (
      <Link
        href="/invoice-detail"
        className="font-medium text-gray-800 transition-colors duration-150 hover:text-brand-500 dark:text-white/90 dark:hover:text-brand-400"
      >
        {row.invoice}
      </Link>
    ),
  },
  { key: "client", header: "Client", sortable: true },
  { key: "issued", header: "Issued", sortable: true },
  { key: "due", header: "Due", sortable: true },
  {
    key: "amount",
    header: "Amount",
    sortable: true,
    render: (row) => (
      <span className="font-medium text-gray-800 dark:text-white/90">
        {row.amount}
      </span>
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
];

export default function InvoicesTable() {
  return (
    <DataTableOne
      columns={columns}
      data={invoices}
      searchPlaceholder="Search invoices..."
    />
  );
}
