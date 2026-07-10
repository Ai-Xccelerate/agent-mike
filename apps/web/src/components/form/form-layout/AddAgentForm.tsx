"use client";
import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import Switch from "@/components/form/switch/Switch";
import Button from "@/components/ui/button/Button";

const roleOptions = [
  { value: "demand-gen", label: "Demand generation" },
  { value: "outbound", label: "Outbound sales" },
  { value: "inbound", label: "Inbound qualification" },
  { value: "technical", label: "Technical pre-sales" },
  { value: "deal-ops", label: "Deal operations" },
  { value: "retention", label: "Retention & expansion" },
];

const accountOptions = [
  { value: "meridian", label: "Meridian Logistics" },
  { value: "brightpath", label: "Brightpath Medical" },
  { value: "corewell", label: "Corewell Manufacturing" },
  { value: "all", label: "All accounts" },
];

const hoursOptions = [
  { value: "business", label: "Business hours (8am–6pm CST)" },
  { value: "extended", label: "Extended (6am–10pm CST)" },
  { value: "always", label: "Always on (24/7)" },
];

export default function AddAgentForm() {
  const [description, setDescription] = useState("");

  return (
    <ComponentCard
      title="Add AI agent"
      desc="Deploy a new AI revenue employee to your workspace."
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="agent-name">
              Agent name <span className="text-error-500">*</span>
            </Label>
            <Input id="agent-name" type="text" placeholder="e.g. Pepper" />
          </div>
          <div>
            <Label>
              Role <span className="text-error-500">*</span>
            </Label>
            <Select
              options={roleOptions}
              placeholder="Select a role"
              onChange={() => {}}
            />
          </div>
          <div>
            <Label>Assigned account</Label>
            <Select
              options={accountOptions}
              placeholder="Select an account"
              onChange={() => {}}
            />
          </div>
          <div>
            <Label>Working hours</Label>
            <Select
              options={hoursOptions}
              placeholder="Select working hours"
              onChange={() => {}}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="escalation-email">Escalation email</Label>
            <Input
              id="escalation-email"
              type="email"
              placeholder="revops@yourcompany.com"
              hint="Conversations the agent can't resolve are routed here."
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <TextArea
              rows={4}
              value={description}
              onChange={setDescription}
              placeholder="What this agent owns — e.g. qualifies inbound demo requests, books meetings, and hands warm leads to the AE team."
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-gray-100 pt-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <Switch
            label="Auto-handoff to a human when confidence drops"
            defaultChecked
          />
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline">
              Cancel
            </Button>
            <Button size="sm">Save agent</Button>
          </div>
        </div>
      </form>
    </ComponentCard>
  );
}
