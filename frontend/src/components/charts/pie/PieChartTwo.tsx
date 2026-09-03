"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export default function PieChartTwo() {
  const options: ApexOptions = {
    // Jules + Pepper identity colors for their slices; neutral tones for the rest.
    colors: ["#3B82F6", "#10B981", "#F79009", "#98A2B3"],
    labels: ["Outbound (Jules)", "Inbound (Pepper)", "Referrals", "Events"],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "pie",
      toolbar: { show: false },
    },
    stroke: { show: false },
    dataLabels: {
      enabled: true,
      style: {
        fontSize: "13px",
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
      },
      dropShadow: { enabled: false },
      formatter: (val: number) => `${val.toFixed(1)}%`,
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
    tooltip: {
      enabled: true,
      y: {
        formatter: (val: number) => `$${val.toLocaleString("en-US")}K pipeline`,
      },
    },
    responsive: [
      {
        breakpoint: 640,
        options: {
          chart: { height: 320 },
          legend: { fontSize: "12px" },
        },
      },
    ],
  };

  const series = [1240, 890, 465, 310];

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <ReactApexChart
        options={options}
        series={series}
        type="pie"
        height={380}
      />
    </div>
  );
}
