import React from "react";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TxnType = "Subscription" | "One-time" | "Refund";
type TxnStatus = "Completed" | "Pending" | "Refunded" | "Failed";

interface Transaction {
  id: string;
  client: string;
  type: TxnType;
  method: string;
  date: string;
  amount: number;
  status: TxnStatus;
}

const transactions: Transaction[] = [
  {
    id: "TXN-9F3A21",
    client: "Meridian Logistics",
    type: "Subscription",
    method: "Visa •••• 4421",
    date: "Today, 9:42 AM",
    amount: 12150,
    status: "Completed",
  },
  {
    id: "TXN-8D2C77",
    client: "Harbor Point Manufacturing",
    type: "Subscription",
    method: "ACH •••• 8830",
    date: "Yesterday, 2:18 PM",
    amount: 8400,
    status: "Completed",
  },
  {
    id: "TXN-7B1E09",
    client: "Crestline Medical Supply",
    type: "One-time",
    method: "Visa •••• 9074",
    date: "Yesterday, 10:05 AM",
    amount: 6500,
    status: "Pending",
  },
  {
    id: "TXN-6A9D54",
    client: "Bluebonnet Industrial Group",
    type: "Subscription",
    method: "ACH •••• 2216",
    date: "Jul 1, 11:31 AM",
    amount: 15900,
    status: "Completed",
  },
  {
    id: "TXN-5C8F62",
    client: "Crestline Medical Supply",
    type: "Refund",
    method: "Visa •••• 9074",
    date: "Jun 30, 4:47 PM",
    amount: -1150,
    status: "Refunded",
  },
  {
    id: "TXN-4E7B38",
    client: "Meridian Logistics",
    type: "One-time",
    method: "ACH •••• 5502",
    date: "Jun 28, 9:12 AM",
    amount: 6500,
    status: "Completed",
  },
  {
    id: "TXN-3D6A90",
    client: "Harbor Point Manufacturing",
    type: "Subscription",
    method: "Visa •••• 1187",
    date: "Jun 27, 3:56 PM",
    amount: 8400,
    status: "Failed",
  },
  {
    id: "TXN-2F5C14",
    client: "Bluebonnet Industrial Group",
    type: "Subscription",
    method: "ACH •••• 2216",
    date: "Jun 26, 8:03 AM",
    amount: 15900,
    status: "Completed",
  },
];

const typeColor: Record<TxnType, "light" | "info" | "warning"> = {
  Subscription: "light",
  "One-time": "info",
  Refund: "warning",
};

const statusColor: Record<TxnStatus, "success" | "warning" | "error" | "light"> =
  {
    Completed: "success",
    Pending: "warning",
    Refunded: "light",
    Failed: "error",
  };

const fmtAmount = (n: number) => {
  const abs = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  return n < 0 ? `-${abs}` : `+${abs}`;
};

const headerClass =
  "px-5 py-3 text-left text-theme-xs font-medium text-gray-500 dark:text-gray-400 md:px-6";

export default function TransactionsTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-1 p-5 md:p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Recent transactions
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Payments, one-time charges, and refunds across all clients
        </p>
      </div>
      {/* Mobile: stacked cards — no horizontal scroll. */}
      <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
        {transactions.map((txn) => (
          <div key={txn.id} className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {txn.client}
                </div>
                <div className="truncate font-mono text-theme-xs text-gray-500 dark:text-gray-400">
                  {txn.id}
                </div>
              </div>
              <Badge size="sm" color={statusColor[txn.status]}>
                {txn.status}
              </Badge>
            </div>
            <dl className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Type
                </dt>
                <dd className="text-right">
                  <Badge size="sm" color={typeColor[txn.type]}>
                    {txn.type}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Method
                </dt>
                <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                  {txn.method}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Date
                </dt>
                <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                  {txn.date}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Amount
                </dt>
                <dd
                  className={`text-right text-theme-sm font-medium tabular-nums ${
                    txn.amount < 0
                      ? "text-error-600 dark:text-error-500"
                      : "text-success-600 dark:text-success-500"
                  }`}
                >
                  {fmtAmount(txn.amount)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader className="border-y border-gray-200 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className={headerClass}>
                Transaction
              </TableCell>
              <TableCell isHeader className={headerClass}>
                Client
              </TableCell>
              <TableCell isHeader className={headerClass}>
                Type
              </TableCell>
              <TableCell isHeader className={headerClass}>
                Method
              </TableCell>
              <TableCell isHeader className={headerClass}>
                Date
              </TableCell>
              <TableCell isHeader className={`${headerClass} text-right`}>
                Amount
              </TableCell>
              <TableCell isHeader className={headerClass}>
                Status
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {transactions.map((txn) => (
              <TableRow
                key={txn.id}
                className="transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              >
                <TableCell className="px-5 py-4 font-mono text-sm text-gray-800 dark:text-white/90 md:px-6">
                  {txn.id}
                </TableCell>
                <TableCell className="whitespace-nowrap px-5 py-4 text-sm text-gray-800 dark:text-white/90 md:px-6">
                  {txn.client}
                </TableCell>
                <TableCell className="px-5 py-4 md:px-6">
                  <Badge size="sm" color={typeColor[txn.type]}>
                    {txn.type}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {txn.method}
                </TableCell>
                <TableCell className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {txn.date}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap px-5 py-4 text-right text-sm font-medium tabular-nums md:px-6 ${
                    txn.amount < 0
                      ? "text-error-600 dark:text-error-500"
                      : "text-success-600 dark:text-success-500"
                  }`}
                >
                  {fmtAmount(txn.amount)}
                </TableCell>
                <TableCell className="px-5 py-4 md:px-6">
                  <Badge size="sm" color={statusColor[txn.status]}>
                    {txn.status}
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
