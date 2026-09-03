"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export default function RadialChartTwo() {
  // Single source of truth for the gauge value (kept in sync across the arc,
  // the overlaid number, and the caption).
  const value = 75;
  const options: ApexOptions = {
    colors: ["#F47920"],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "radialBar",
      sparkline: { enabled: true },
      toolbar: { show: false },
    },
    plotOptions: {
      radialBar: {
        startAngle: -90,
        endAngle: 90,
        hollow: { size: "78%" },
        track: {
          background: "rgba(148, 163, 184, 0.2)",
          strokeWidth: "100%",
          margin: 5,
        },
        // Value/label are rendered in the flow block below so we fully control
        // stacking order (number → status → copy) and never overlap.
        dataLabels: {
          name: { show: false },
          value: { show: false },
        },
      },
    },
    fill: { type: "solid", colors: ["#F47920"] },
    stroke: { lineCap: "round" },
    labels: ["Progress"],
  };

  const series = [value];

  return (
    <div className="mx-auto w-full max-w-[420px]">
      {/* Semicircle arc only — value + status are overlaid dead-center in the
          hollow so they sit clear of the arc; copy sits below the arc. */}
      <div className="relative">
        <ReactApexChart
          options={options}
          series={series}
          type="radialBar"
          height={260}
        />
        <div className="pointer-events-none absolute inset-x-0 top-[56%] flex -translate-y-1/2 flex-col items-center gap-1.5">
          <span className="text-4xl font-bold tracking-tight text-gray-800 dark:text-white/90">
            {value}%
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-xs font-medium text-success-700 dark:bg-success-500/15 dark:text-success-500">
            <span className="size-1.5 rounded-full bg-success-500" />
            On track
          </span>
        </div>
      </div>
      <p className="mx-auto -mt-2 max-w-[340px] text-center text-sm text-gray-500 dark:text-gray-400">
        The AI workforce is at {value}% of the quarterly revenue target with
        three weeks left in the quarter.
      </p>
    </div>
  );
}
