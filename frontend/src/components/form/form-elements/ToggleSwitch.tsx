"use client";
import React from "react";

import ComponentCard from "@/components/common/ComponentCard";

import Switch from "../switch/Switch";

/** On is ink, never orange: the orange belongs to the view's primary action. */
export default function ToggleSwitch() {
  return (
    <ComponentCard title="Toggle switch">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Switch label="Off" />
        <Switch label="On" defaultChecked />
        <Switch label="Disabled" disabled />
        <Switch label="Disabled, on" disabled defaultChecked />
      </div>
      <div>
        <Switch label="Weekly digest" defaultChecked />
        <p className="mt-1 pl-14 text-theme-xs text-gray-500 dark:text-gray-400">
          A Monday summary of pipeline, replies and agent activity.
        </p>
      </div>
    </ComponentCard>
  );
}
