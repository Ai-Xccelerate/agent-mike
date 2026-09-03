"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const days = Array.from({ length: 30 }, (_, i) => `Jun ${i + 5 > 30 ? i - 25 : i + 5}`);

const leadsData = [
  72, 68, 81, 90, 76, 54, 49, 88, 95, 102, 97, 110, 84, 61, 58, 104, 118, 112,
  121, 109, 73, 66, 126, 132, 119, 138, 127, 92, 84, 141,
];

export default function LeadsSourcedChart() {
  const options: ApexOptions = {
    colors: ["#F47920"],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "area",
      height: 310,
      toolbar: { show: false },
    },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.35, opacityTo: 0.02 },
    },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 5 } },
    grid: {
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    xaxis: {
      categories: days,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickAmount: 6,
      labels: { style: { colors: "#98A2B3", fontSize: "12px" } },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: { style: { colors: "#98A2B3", fontSize: "12px" } },
    },
    legend: { show: false },
    tooltip: {
      x: { show: true },
      y: { formatter: (val: number) => `${val} leads` },
    },
  };

  const series = [{ name: "Leads sourced", data: leadsData }];

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Leads sourced
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Daily volume over the last 30 days
          </p>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          2,847 total
        </span>
      </div>
      <div className="mt-2">
        <ReactApexChart
          options={options}
          series={series}
          type="area"
          height={310}
        />
      </div>
    </div>
  );
}
