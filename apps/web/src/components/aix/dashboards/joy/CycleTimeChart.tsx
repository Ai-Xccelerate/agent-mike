"use client";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import React from "react";
import { AGENT_META } from "@/components/aix/AgentAvatar";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const cycleTime = [41, 39, 38, 36, 34, 32];
const benchmark = [40, 40, 40, 40, 40, 40];

export default function CycleTimeChart() {
  const joyHex = AGENT_META.Joy.hex;

  const options: ApexOptions = {
    colors: [joyHex, "#98A2B3"],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "line",
      height: 320,
      toolbar: { show: false },
    },
    stroke: {
      curve: "smooth",
      width: [3, 2],
      dashArray: [0, 6],
    },
    markers: {
      size: [4, 0],
      strokeWidth: 2,
      hover: { size: 6 },
    },
    dataLabels: { enabled: false },
    grid: {
      strokeDashArray: 4,
      borderColor: "#E4E7EC",
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      categories: months,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: "#98A2B3", fontSize: "12px" },
      },
    },
    yaxis: {
      min: 25,
      max: 45,
      tickAmount: 4,
      labels: {
        style: { colors: "#98A2B3", fontSize: "12px" },
        formatter: (val: number) => `${Math.round(val)}d`,
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
      y: { formatter: (val: number) => `${val} days` },
    },
  };

  const series = [
    { name: "Avg cycle time", data: cycleTime },
    { name: "Industry benchmark", data: benchmark },
  ];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Deal cycle time trend
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Average days from qualified to closed-won since Joy joined the desk
        </p>
      </div>
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
