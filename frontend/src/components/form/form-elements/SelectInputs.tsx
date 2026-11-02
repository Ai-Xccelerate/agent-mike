"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";

import Label from "../Label";
import MultiSelect from "../MultiSelect";
import Select from "../Select";

const ACCOUNT_OPTIONS = [
  { value: "northwind", label: "Northwind Logistics" },
  { value: "fleetwise", label: "Fleetwise" },
  { value: "ledgerly", label: "Ledgerly" },
  { value: "brightline", label: "Brightline Health" },
];

const AGENT_OPTIONS = [
  { value: "nick", text: "Nick", selected: false },
  { value: "jules", text: "Jules", selected: false },
  { value: "pepper", text: "Pepper", selected: false },
  { value: "tony", text: "Tony", selected: false },
  { value: "joy", text: "Joy", selected: false },
  { value: "george", text: "George", selected: false },
];

export default function SelectInputs() {
  const [account, setAccount] = useState("");
  const [agents, setAgents] = useState<string[]>(["jules", "pepper"]);

  return (
    <ComponentCard title="Select inputs" desc="One value from a list, or several.">
      <div className="space-y-5">
        <div>
          <Label htmlFor="si-account">Account</Label>
          <Select
            id="si-account"
            options={ACCOUNT_OPTIONS}
            placeholder="Choose an account"
            value={account}
            onChange={setAccount}
          />
        </div>
        <div>
          <MultiSelect
            label="Agents on this account"
            options={AGENT_OPTIONS}
            defaultSelected={["jules", "pepper"]}
            onChange={setAgents}
          />
          <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">
            {agents.length === 0
              ? "No agents yet: the account is unattended."
              : `${agents.length} agent${agents.length === 1 ? "" : "s"} will work this account.`}
          </p>
        </div>
      </div>
    </ComponentCard>
  );
}
