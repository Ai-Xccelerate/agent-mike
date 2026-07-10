"use client";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import React from "react";
import { AGENT_META } from "@/components/aix/AgentAvatar";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const weeks = [
  "May 4",
  "May 11",
  "May 18",
  "May 25",
  "Jun 1",
  "Jun 8",
  "Jun 15",
  "Jun 22",
  "Jun 29",
];

const deflections = [212, 228, 241, 236, 258, 271, 284, 296, 312];
const escalations = [41, 38, 36, 39, 34, 32, 31, 29, 28];

export default function DeflectionsChart() {
  const tonyHex = AGENT_META.Tony.hex;

  const options: ApexOptions = {
    colors: [tonyHex, "#FAB673"],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "line",
      height: 320,
      toolbar: { show: false },
    },
    stroke: {
      curve: "smooth",
      width: [3, 2],
      dashArray: [0, 5],
    },
    markers: {
      size: 0,
      hover: { size: 5 },
    },
    dataLabels: { enabled: false },
    grid: {
      strokeDashArray: 4,
      borderColor: "#E4E7EC",
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      categories: weeks,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: "#98A2B3", fontSize: "12px" },
      },
    },
    yaxis: {
      labels: {
        style: { colors: "#98A2B3", fontSize: "12px" },
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Inter",
      labels: { colors: "#98A2B3" },
      markers: { size: 5 },
    },
    tooltip: {
      x: { show: true },
      y: { formatter: (val: number) => `${val} tickets` },
    },
  };

  const series = [
    { name: "Deflected", data: deflections },
    { name: "Escalated", data: escalations },
  ];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Deflections vs escalations
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Weekly ticket volume Tony resolved without a human, last 9 weeks
          </p>
        </div>
      </div>
      {/* Responsive chart — no overflow wrapper. A scroll container here makes
          overflow-y compute to auto, so the hover tooltip triggers a scrollbar
          and a resize→redraw loop (jitter). Charts redraw at any width. */}
      <div className="mt-2">
        <ReactApexChart
          options={options}
          series={series}
          type="line"
          height={320}
        />
      </div>
    </div>
  );
}
