"use client";
import React from "react";
import { worldMill } from "@react-jvectormap/world";
import dynamic from "next/dynamic";

const VectorMap = dynamic(
  () => import("@react-jvectormap/core").then((mod) => mod.VectorMap),
  { ssr: false }
);

interface VectorMapOneProps {
  mapColor?: string;
}

const VectorMapOne: React.FC<VectorMapOneProps> = ({ mapColor }) => {
  return (
    <div className="h-[420px] w-full">
      <VectorMap
        map={worldMill}
        backgroundColor="transparent"
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
            fillOpacity: 0.85,
            cursor: "pointer",
            fill: "#F47920",
            stroke: "none",
          },
          selected: {
            fill: "#F47920",
          },
          selectedHover: {},
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

export default VectorMapOne;
