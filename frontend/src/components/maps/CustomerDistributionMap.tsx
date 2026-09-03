"use client";
import React from "react";
import { worldMill } from "@react-jvectormap/world";
import dynamic from "next/dynamic";

const VectorMap = dynamic(
  () => import("@react-jvectormap/core").then((mod) => mod.VectorMap),
  { ssr: false }
);

type MarkerStyle = {
  initial: {
    fill: string;
    r: number;
  };
};

type Marker = {
  latLng: [number, number];
  name: string;
  style?: {
    fill: string;
    borderWidth: number;
    borderColor: string;
    stroke?: string;
    strokeOpacity?: number;
  };
};

const CUSTOMER_MARKERS: Marker[] = [
  {
    latLng: [32.7767, -96.797],
    name: "Dallas — 14 customers",
    style: { fill: "#F47920", borderWidth: 1, borderColor: "white" },
  },
  {
    latLng: [40.7128, -74.006],
    name: "New York — 11 customers",
    style: { fill: "#F47920", borderWidth: 1, borderColor: "white" },
  },
  {
    latLng: [51.5074, -0.1278],
    name: "London — 8 customers",
    style: { fill: "#F47920", borderWidth: 1, borderColor: "white" },
  },
  {
    latLng: [19.076, 72.8777],
    name: "Mumbai — 6 customers",
    style: { fill: "#F47920", borderWidth: 1, borderColor: "white" },
  },
  {
    latLng: [1.3521, 103.8198],
    name: "Singapore — 4 customers",
    style: { fill: "#F47920", borderWidth: 1, borderColor: "white" },
  },
  {
    latLng: [-33.8688, 151.2093],
    name: "Sydney — 3 customers",
    style: { fill: "#F47920", borderWidth: 1, borderColor: "white" },
  },
];

interface CustomerDistributionMapProps {
  mapColor?: string;
}

const CustomerDistributionMap: React.FC<CustomerDistributionMapProps> = ({
  mapColor,
}) => {
  return (
    <div className="h-[420px] w-full">
      <VectorMap
        map={worldMill}
        backgroundColor="transparent"
        markerStyle={
          {
            initial: {
              fill: "#F47920",
              r: 5,
            },
          } as MarkerStyle
        }
        markersSelectable={true}
        markers={CUSTOMER_MARKERS}
        zoomOnScroll={false}
        zoomMax={12}
        zoomMin={1}
        zoomAnimate={true}
        zoomStep={1.5}
        regionStyle={{
          initial: {
            fill: mapColor || "#D0D5DD",
            fillOpacity: 1,
            fontFamily: "Inter",
            stroke: "none",
            strokeWidth: 0,
            strokeOpacity: 0,
          },
          hover: {
            fillOpacity: 0.7,
            cursor: "pointer",
            fill: "#F47920",
            stroke: "none",
          },
          selected: {
            fill: "#FAB673",
          },
          selectedHover: {
            fill: "#F47920",
          },
        }}
        regionLabelStyle={{
          initial: {
            fill: "#35373e",
            fontWeight: 500,
            fontSize: "13px",
            stroke: "none",
          },
          hover: {},
          selected: {},
          selectedHover: {},
        }}
      />
    </div>
  );
};

export default CustomerDistributionMap;
