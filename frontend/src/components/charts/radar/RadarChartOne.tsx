"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export default function RadarChartOne() {
  const options: ApexOptions = {
    // Jules (outbound) + Pepper (inbound) locked identity colors.
    colors: ["#3B82F6", "#10B981"],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "radar",
      toolbar: { show: false },
      dropShadow: { enabled: false },
    },
    stroke: { width: 2 },
    fill: { opacity: 0.15 },
    markers: {
      size: 4,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: { size: 6 },
    },
    xaxis: {
      categories: ["Speed", "Accuracy", "Empathy", "Coverage", "Conversion"],
      labels: {
        style: {
          colors: ["#9CA3AF", "#9CA3AF", "#9CA3AF", "#9CA3AF", "#9CA3AF"],
          fontSize: "12px",
          fontFamily: "Inter, sans-serif",
        },
      },
    },
    yaxis: {
      show: false,
      min: 0,
      max: 100,
      tickAmount: 5,
    },
    plotOptions: {
      radar: {
        polygons: {
          strokeColors: "rgba(148, 163, 184, 0.2)",
          connectorColors: "rgba(148, 163, 184, 0.2)",
          fill: { colors: ["transparent"] },
        },
      },
    },
    legend: {
      show: true,
      position: "bottom",
      horizontalAlign: "center",
      fontFamily: "Inter, sans-serif",
      fontSize: "13px",
      labels: { colors: "#6B7280" },
      markers: { size: 5 },
      itemMargin: { horizontal: 10, vertical: 4 },
    },
    dataLabels: { enabled: false },
    tooltip: {
      enabled: true,
      y: { formatter: (val: number) => `${val} / 100` },
    },
    grid: {
      strokeDashArray: 4,
    },
  };

  const series = [
    {
      name: "Jules (outbound)",
      data: [88, 76, 71, 92, 84],
    },
    {
      name: "Pepper (inbound)",
      data: [94, 82, 89, 68, 77],
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <ReactApexChart
        options={options}
        series={series}
        type="radar"
        height={400}
      />
    </div>
  );
}
