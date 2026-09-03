import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PipelineStage {
  stage: string;
  count: number;
  value: string;
  weighted: string;
  probability: string;
}

const stages: PipelineStage[] = [
  {
    stage: "Discovery",
    count: 31,
    value: "$2,480,000",
    weighted: "$372,000",
    probability: "15%",
  },
  {
    stage: "Qualified",
    count: 22,
    value: "$1,940,000",
    weighted: "$582,000",
    probability: "30%",
  },
  {
    stage: "Proposal",
    count: 14,
    value: "$1,310,000",
    weighted: "$655,000",
    probability: "50%",
  },
  {
    stage: "Negotiation",
    count: 10,
    value: "$925,000",
    weighted: "$647,500",
    probability: "70%",
  },
  {
    stage: "Legal review",
    count: 7,
    value: "$610,000",
    weighted: "$549,000",
    probability: "90%",
  },
];

export default function PipelineByStageTable() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 md:px-6 md:pt-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Pipeline by stage
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          84 open deals Joy is monitoring, weighted by stage probability
        </p>
      </div>
      {/* Mobile: stacked cards — no horizontal scroll. */}
      <div className="mt-4 space-y-3 px-5 pb-5 md:hidden">
        {stages.map((row) => (
          <div
            key={row.stage}
            className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <div className="text-sm font-medium text-gray-800 dark:text-white/90">
              {row.stage}
            </div>
            <dl className="mt-2 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Deals
                </dt>
                <dd className="text-right text-theme-sm tabular-nums text-gray-700 dark:text-gray-300">
                  {row.count}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Value
                </dt>
                <dd className="text-right text-theme-sm tabular-nums text-gray-700 dark:text-gray-300">
                  {row.value}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Probability
                </dt>
                <dd className="text-right text-theme-sm tabular-nums text-gray-700 dark:text-gray-300">
                  {row.probability}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Weighted
                </dt>
                <dd className="text-right text-theme-sm font-medium tabular-nums text-gray-800 dark:text-white/90">
                  {row.weighted}
                </dd>
              </div>
            </dl>
          </div>
        ))}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.02]">
          <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Total
          </div>
          <dl className="mt-2 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                Deals
              </dt>
              <dd className="text-right text-theme-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
                84
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                Value
              </dt>
              <dd className="text-right text-theme-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
                $7,265,000
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                Weighted
              </dt>
              <dd className="text-right text-theme-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
                $2,805,500
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="custom-scrollbar mt-4 hidden max-w-full overflow-x-auto md:block">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell
                isHeader
                className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Stage
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Deals
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Value
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Probability
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
              >
                Weighted
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {stages.map((row) => (
              <TableRow key={row.stage}>
                <TableCell className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90 md:px-6">
                  {row.stage}
                </TableCell>
                <TableCell className="px-5 py-4 text-right text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {row.count}
                </TableCell>
                <TableCell className="whitespace-nowrap px-5 py-4 text-right text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {row.value}
                </TableCell>
                <TableCell className="px-5 py-4 text-right text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  {row.probability}
                </TableCell>
                <TableCell className="whitespace-nowrap px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90 md:px-6">
                  {row.weighted}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-gray-50 dark:bg-white/[0.02]">
              <TableCell className="px-5 py-4 text-sm font-semibold text-gray-800 dark:text-white/90 md:px-6">
                Total
              </TableCell>
              <TableCell className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90 md:px-6">
                84
              </TableCell>
              <TableCell className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90 md:px-6">
                $7,265,000
              </TableCell>
              <TableCell className="px-5 py-4 md:px-6">{""}</TableCell>
              <TableCell className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90 md:px-6">
                $2,805,500
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
