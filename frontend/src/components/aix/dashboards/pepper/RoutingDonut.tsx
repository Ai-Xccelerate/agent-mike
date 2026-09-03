"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const labels = ["Sales", "Support", "Docs", "Other"];
const values = [438, 312, 189, 104];
const colors = ["#12B76A", "#F79009", "#98A2B3", "#475467"];

const total = values.reduce((a, b) => a + b, 0);

export default function RoutingDonut() {
  const options: ApexOptions = {
    colors,
    labels,
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "donut",
    },
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            value: {
              show: true,
              fontSize: "24px",
              fontWeight: 700,
              offsetY: 4,
              color: "#667085",
            },
            total: {
              show: true,
              label: "Routed",
              fontSize: "13px",
              color: "#98A2B3",
              formatter: () => total.toLocaleString(),
            },
          },
        },
      },
    },
    tooltip: {
      y: { formatter: (val: number) => `${val.toLocaleString()} conversations` },
    },
  };

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Routing breakdown
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Where Pepper sent conversations this week
        </p>
      </div>
      <div className="mx-auto mt-4 max-w-[260px]">
        <ReactApexChart
          options={options}
          series={values}
          type="donut"
          height={240}
        />
      </div>
      <ul className="mt-5 space-y-2.5">
        {labels.map((label, i) => (
          <li key={label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: colors[i] }}
              />
              {label}
            </span>
            <span className="text-sm font-medium text-gray-800 dark:text-white/90">
              {Math.round((values[i] / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
