"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export default function RepliesByWeekChart() {
  const options: ApexOptions = {
    colors: ["#3B82F6"], // Jules identity color (AGENT_META.Jules)
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "bar",
      height: 310,
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "45%",
        borderRadius: 6,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 4, colors: ["transparent"] },
    grid: {
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    xaxis: {
      categories: [
        "Apr 27",
        "May 4",
        "May 11",
        "May 18",
        "May 25",
        "Jun 1",
        "Jun 8",
        "Jun 15",
        "Jun 22",
        "Jun 29",
      ],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: "#98A2B3", fontSize: "12px" } },
    },
    yaxis: {
      labels: { style: { colors: "#98A2B3", fontSize: "12px" } },
    },
    legend: { show: false },
    fill: { opacity: 1 },
    tooltip: {
      x: { show: true },
      y: { formatter: (val: number) => `${val} replies` },
    },
  };

  const series = [
    {
      name: "Replies",
      data: [42, 48, 39, 56, 61, 58, 67, 72, 64, 78],
    },
  ];

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Replies by week
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Prospect replies across all active sequences
          </p>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          585 total
        </span>
      </div>
      <div className="mt-2">
        <ReactApexChart
          options={options}
          series={series}
          type="bar"
          height={310}
        />
      </div>
    </div>
  );
}
