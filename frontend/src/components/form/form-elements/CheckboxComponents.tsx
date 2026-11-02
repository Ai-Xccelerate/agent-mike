"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";

import Checkbox from "../input/Checkbox";

export default function CheckboxComponents() {
  const [unchecked, setUnchecked] = useState(false);
  const [checked, setChecked] = useState(true);
  const [disabled, setDisabled] = useState(false);
  return (
    <ComponentCard title="Checkbox">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Checkbox checked={unchecked} onChange={setUnchecked} label="Default" />
        <Checkbox checked={checked} onChange={setChecked} label="Checked" />
        <Checkbox checked={disabled} onChange={setDisabled} disabled label="Disabled" />
      </div>
    </ComponentCard>
  );
}
