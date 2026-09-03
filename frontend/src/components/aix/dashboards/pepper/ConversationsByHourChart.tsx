"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const hourlyData = [
  6, 4, 3, 2, 3, 5, 12, 24, 46, 68, 79, 72, 58, 66, 74, 81, 69, 52, 38, 27, 21,
  16, 11, 8,
];

const hours = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  return `${h}${i < 12 ? "am" : "pm"}`;
});

const maxVal = Math.max(...hourlyData);

// Heat-style: each column's intensity scales with its volume
const barColors = hourlyData.map((v) => {
  const t = 0.25 + 0.75 * (v / maxVal);
  return `rgba(18, 183, 106, ${t.toFixed(2)})`;
});

export default function ConversationsByHourChart() {
  const options: ApexOptions = {
    colors: barColors,
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "bar",
      height: 310,
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "70%",
        borderRadius: 4,
        borderRadiusApplication: "end",
        distributed: true,
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: false },
    grid: {
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    xaxis: {
      categories: hours,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickAmount: 8,
      labels: { style: { colors: "#98A2B3", fontSize: "12px" } },
    },
    yaxis: {
      labels: { style: { colors: "#98A2B3", fontSize: "12px" } },
    },
    legend: { show: false },
    fill: { opacity: 1 },
    tooltip: {
      x: { show: true },
      y: { formatter: (val: number) => `${val} conversations` },
    },
  };

  const series = [{ name: "Conversations", data: hourlyData }];

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Conversations by hour
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Today&apos;s volume — darker means busier
          </p>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Peak 3–4 PM
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
