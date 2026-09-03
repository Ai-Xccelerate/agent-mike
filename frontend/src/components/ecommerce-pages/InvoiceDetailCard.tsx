import React from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckLineIcon, DownloadIcon, PaperPlaneIcon } from "@/icons";

interface InvoiceLineItem {
  description: string;
  detail: string;
  qty: number;
  rate: number;
}

const lineItems: InvoiceLineItem[] = [
  {
    description: "Jules — outbound AI SDR seat",
    detail: "Monthly seat, Jul 2026",
    qty: 2,
    rate: 4200,
  },
  {
    description: "Pepper — inbound response seat",
    detail: "Monthly seat, Jul 2026",
    qty: 1,
    rate: 3600,
  },
  {
    description: "Nick — demand gen seat",
    detail: "Monthly seat, Jul 2026",
    qty: 1,
    rate: 3800,
  },
  {
    description: "Onboarding & AI fluency workshop",
    detail: "One-time, delivered Jun 2026",
    qty: 1,
    rate: 6500,
  },
];

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const subtotal = lineItems.reduce((sum, li) => sum + li.qty * li.rate, 0);
const taxRate = 0.0825;
const tax = Math.round(subtotal * taxRate * 100) / 100;
const total = subtotal + tax;

export default function InvoiceDetailCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-gray-200 p-5 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between md:p-6">
        <div>
          <p className="text-lg font-bold tracking-tight text-gray-800 dark:text-white/90">
            AI<span className="text-brand-500">X</span>ccelerate
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            AI Workforce Platform
          </p>
        </div>
        <div className="sm:text-right">
          <div className="flex items-center gap-3 sm:justify-end">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              INV-2026-0042
            </h3>
            <Badge size="sm" color="warning">
              Awaiting payment
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Issued Jul 1, 2026 · Due Jul 31, 2026
          </p>
        </div>
      </div>

      {/* From / To */}
      <div className="grid grid-cols-1 gap-6 border-b border-gray-200 p-5 dark:border-gray-800 sm:grid-cols-2 md:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            From
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">
            AI Xccelerate, Inc.
          </p>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            1420 Preston Trail
            <br />
            Celina, TX 75009
            <br />
            billing@aixccelerate.com
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Bill to
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">
            Meridian Logistics
          </p>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            8800 Freight Line Rd, Suite 300
            <br />
            Fort Worth, TX 76104
            <br />
            ap@meridianlogistics.com
          </p>
        </div>
      </div>

      {/* Line items */}
      {/* Mobile: stacked cards — no horizontal scroll. */}
      <div className="space-y-3 p-5 md:hidden">
        {lineItems.map((li) => (
          <div
            key={li.description}
            className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              {li.description}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {li.detail}
            </p>
            <dl className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Qty
                </dt>
                <dd className="text-right text-theme-sm tabular-nums text-gray-700 dark:text-gray-300">
                  {li.qty}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Rate
                </dt>
                <dd className="text-right text-theme-sm tabular-nums text-gray-700 dark:text-gray-300">
                  {fmt(li.rate)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-1.5 dark:border-gray-800">
                <dt className="text-theme-xs font-medium text-gray-600 dark:text-gray-300">
                  Amount
                </dt>
                <dd className="text-right text-sm font-medium tabular-nums text-gray-800 dark:text-white/90">
                  {fmt(li.qty * li.rate)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader className="border-b border-gray-200 dark:border-gray-800">
            <TableRow>
              <TableCell
                isHeader
                className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 md:px-6"
              >
                Item
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 md:px-6"
              >
                Qty
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 md:px-6"
              >
                Rate
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 md:px-6"
              >
                Amount
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {lineItems.map((li) => (
              <TableRow key={li.description}>
                <TableCell className="px-5 py-4 md:px-6">
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {li.description}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {li.detail}
                  </p>
                </TableCell>
                <TableCell className="px-5 py-4 text-right text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {li.qty}
                </TableCell>
                <TableCell className="px-5 py-4 text-right text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {fmt(li.rate)}
                </TableCell>
                <TableCell className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90 md:px-6">
                  {fmt(li.qty * li.rate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="flex justify-end border-t border-gray-200 p-5 dark:border-gray-800 md:p-6">
        <div className="w-full max-w-xs space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
            <span className="font-medium text-gray-800 dark:text-white/90">
              {fmt(subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              Tax (8.25%)
            </span>
            <span className="font-medium text-gray-800 dark:text-white/90">
              {fmt(tax)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Total due
            </span>
            <span className="text-xl font-bold tracking-tight text-gray-800 dark:text-white/90">
              {fmt(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer note + actions */}
      <div className="flex flex-col gap-4 border-t border-gray-200 p-5 dark:border-gray-800 md:p-6 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-xs leading-5 text-gray-500 dark:text-gray-400">
          Payment terms: Net 30. Please reference INV-2026-0042 on your
          remittance. Questions? Email billing@aixccelerate.com — we usually
          reply within a business day.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" startIcon={<DownloadIcon />}>
            Download PDF
          </Button>
          <Button size="sm" variant="outline" startIcon={<CheckLineIcon />}>
            Mark paid
          </Button>
          <Button size="sm" variant="primary" startIcon={<PaperPlaneIcon />}>
            Send invoice
          </Button>
        </div>
      </div>
    </div>
  );
}
