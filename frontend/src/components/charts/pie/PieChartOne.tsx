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

export default function PieChartOne() {
  const options: ApexOptions = {
    colors: AGENT_COLORS,
    labels: AGENTS,
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "donut",
      toolbar: { show: false },
    },
    stroke: { show: false },
    dataLabels: { enabled: false },
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
    plotOptions: {
      pie: {
        donut: {
          size: "70%",
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: "13px",
              color: "#6B7280",
            },
            value: {
              show: true,
              fontSize: "24px",
              fontWeight: 700,
              color: "#6B7280",
              formatter: (val: string) =>
                Number(val).toLocaleString("en-US"),
            },
            total: {
              show: true,
              label: "Conversations",
              fontSize: "13px",
              color: "#6B7280",
              formatter: (w) =>
                w.globals.seriesTotals
                  .reduce((a: number, b: number) => a + b, 0)
                  .toLocaleString("en-US"),
            },
          },
        },
      },
    },
    tooltip: {
      enabled: true,
      y: {
        formatter: (val: number) =>
          `${val.toLocaleString("en-US")} conversations`,
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

  const series = [3428, 2716, 2194, 1687, 1412, 1156];

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <ReactApexChart
        options={options}
        series={series}
        type="donut"
        height={380}
      />
    </div>
  );
}
