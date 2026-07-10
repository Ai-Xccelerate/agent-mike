"use client";
import React from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export default function RevenueByQuarterChart() {
  const options: ApexOptions = {
    colors: ["#F47920", "#98A2B3"],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "bar",
      height: 320,
      stacked: true,
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "40%",
        borderRadius: 6,
        borderRadiusApplication: "end",
        borderRadiusWhenStacked: "last",
      },
    },
    dataLabels: { enabled: false },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Inter",
      markers: { size: 5 },
    },
    grid: {
      strokeDashArray: 4,
      yaxis: { lines: { show: true } },
    },
    xaxis: {
      categories: [
        "Q3 '24",
        "Q4 '24",
        "Q1 '25",
        "Q2 '25",
        "Q3 '25",
        "Q4 '25",
        "Q1 '26",
        "Q2 '26",
      ],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { fontSize: "12px", colors: "#98A2B3" },
      },
    },
    yaxis: {
      labels: {
        style: { fontSize: "12px", colors: ["#98A2B3"] },
        formatter: (val: number) => `$${val.toLocaleString()}K`,
      },
    },
    fill: { opacity: 1 },
    tooltip: {
      x: { show: true },
      y: {
        formatter: (val: number) => `$${val.toLocaleString()}K`,
      },
    },
  };

  const series = [
    {
      name: "Agent-influenced",
      data: [148, 196, 242, 287, 331, 384, 428, 476],
    },
    {
      name: "Human-sourced",
      data: [612, 634, 641, 653, 668, 671, 689, 702],
    },
  ];

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Revenue by quarter
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Agent-influenced vs human-sourced revenue, last 8 quarters
        </p>
      </div>
      <div>
        <ReactApexChart
          options={options}
          series={series}
          type="bar"
          height={320}
        />
      </div>
    </div>
  );
}
