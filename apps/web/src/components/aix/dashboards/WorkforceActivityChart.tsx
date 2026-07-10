"use client";
import React from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export default function WorkforceActivityChart() {
  const options: ApexOptions = {
    colors: ["#F47920", "#FAB673"],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "area",
      height: 320,
      toolbar: { show: false },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Inter",
      markers: { size: 5 },
    },
    stroke: {
      curve: "smooth",
      width: [2, 2],
    },
    fill: {
      type: "gradient",
      gradient: {
        opacityFrom: 0.45,
        opacityTo: 0,
      },
    },
    markers: {
      size: 0,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: { size: 6 },
    },
    grid: {
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    dataLabels: { enabled: false },
    tooltip: {
      enabled: true,
      y: {
        formatter: (val: number) => `${val.toLocaleString()} conversations`,
      },
    },
    xaxis: {
      type: "category",
      categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { fontSize: "12px", colors: "#98A2B3" },
      },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { fontSize: "12px", colors: ["#98A2B3"] },
        formatter: (val: number) => val.toLocaleString(),
      },
    },
  };

  const series = [
    {
      name: "This week",
      data: [1042, 1187, 1263, 1149, 1284, 876, 812],
    },
    {
      name: "Last week",
      data: [934, 1061, 1108, 1023, 1144, 802, 745],
    },
  ];

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Workforce activity
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Conversations handled across all 6 agents, last 7 days
        </p>
      </div>
      <div>
        <ReactApexChart
          options={options}
          series={series}
          type="area"
          height={320}
        />
      </div>
    </div>
  );
}
