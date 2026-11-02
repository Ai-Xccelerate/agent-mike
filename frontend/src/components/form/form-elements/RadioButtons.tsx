"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";

import Radio from "../input/Radio";

export default function RadioButtons() {
  const [selected, setSelected] = useState<string>("option2");

  return (
    <ComponentCard title="Radio buttons">
      <fieldset>
        <legend className="sr-only">Radio states</legend>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Radio id="radio1" name="group1" value="option1" checked={selected === "option1"} onChange={setSelected} label="Default" />
          <Radio id="radio2" name="group1" value="option2" checked={selected === "option2"} onChange={setSelected} label="Selected" />
          <Radio
            id="radio3"
            name="group1"
            value="option3"
            checked={selected === "option3"}
            onChange={setSelected}
            label="Disabled"
            disabled
          />
        </div>
      </fieldset>
    </ComponentCard>
  );
}
