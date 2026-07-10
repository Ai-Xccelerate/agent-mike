"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

import { AGENT_META, AgentName } from "@/components/aix/AgentAvatar";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const AGENTS: AgentName[] = ["Nick", "Jules", "Pepper", "Tony", "Joy", "George"];
// Locked agent identity colors — never an invented palette.
const AGENT_COLORS = AGENTS.map((a) => AGENT_META[a].hex);
const ATTAINMENT = [92, 84, 78, 71, 66, 58];

export default function RadialChartOne() {
  const options: ApexOptions = {
    colors: AGENT_COLORS,
    labels: AGENTS,
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "radialBar",
      toolbar: { show: false },
    },
    plotOptions: {
      radialBar: {
        hollow: { size: "28%" },
        track: {
          background: "rgba(148, 163, 184, 0.2)",
          margin: 4,
        },
        dataLabels: {
          name: {
            show: true,
            fontSize: "13px",
            color: "#6B7280",
          },
          value: {
            show: true,
            fontSize: "22px",
            fontWeight: 700,
            color: "#6B7280",
            formatter: (val: number) => `${val}%`,
          },
        },
      },
    },
    stroke: { lineCap: "round" },
    legend: {
      show: true,
      position: "bottom",
      horizontalAlign: "center",
      fontFamily: "Inter, sans-serif",
      fontSize: "13px",
      labels: { colors: "#6B7280" },
      markers: { size: 5 },
      itemMargin: { horizontal: 10, vertical: 4 },
      formatter: (seriesName, opts) =>
        `${seriesName} ${opts.w.globals.series[opts.seriesIndex]}%`,
    },
    responsive: [
      {
        breakpoint: 640,
        options: {
          chart: { height: 340 },
          legend: { fontSize: "12px" },
        },
      },
    ],
  };

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <ReactApexChart
        options={options}
        series={ATTAINMENT}
        type="radialBar"
        height={420}
      />
    </div>
  );
}
