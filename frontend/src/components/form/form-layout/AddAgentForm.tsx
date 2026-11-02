"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Select from "@/components/form/Select";
import Switch from "@/components/form/switch/Switch";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/components/ui/toast/ToastProvider";

const roleOptions = [
  { value: "demand-gen", label: "Demand generation" },
  { value: "outbound", label: "Outbound sales" },
  { value: "inbound", label: "Inbound qualification" },
  { value: "technical", label: "Technical pre-sales" },
  { value: "deal-ops", label: "Deal operations" },
  { value: "retention", label: "Retention and expansion" },
];

const accountOptions = [
  { value: "northwind", label: "Northwind Logistics" },
  { value: "fleetwise", label: "Fleetwise" },
  { value: "ledgerly", label: "Ledgerly" },
  { value: "all", label: "All accounts" },
];

const hoursOptions = [
  { value: "business", label: "Business hours (8am–6pm CST)" },
  { value: "extended", label: "Extended (6am–10pm CST)" },
  { value: "always", label: "Always on (24/7)" },
];

/** The page's main form: its Save is the view's one primary button. */
export default function AddAgentForm() {
  const toast = useToast();
  const [description, setDescription] = useState("");
  const [role, setRole] = useState("");
  const [account, setAccount] = useState("");
  const [hours, setHours] = useState("business");

  return (
    <ComponentCard title="Add an AI agent" desc="Deploy a new AI revenue employee to your workspace.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          toast({ variant: "success", title: "Agent saved", message: "It starts on its first account within the hour." });
        }}
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="agent-name" required>
              Agent name
            </Label>
            <Input id="agent-name" type="text" placeholder="Pepper" required />
          </div>
          <div>
            <Label htmlFor="agent-role" required>
              Role
            </Label>
            <Select id="agent-role" options={roleOptions} placeholder="Choose a role" value={role} onChange={setRole} />
          </div>
          <div>
            <Label htmlFor="agent-account">Assigned account</Label>
            <Select
              id="agent-account"
              options={accountOptions}
              placeholder="Choose an account"
              value={account}
              onChange={setAccount}
            />
          </div>
          <div>
            <Label htmlFor="agent-hours">Working hours</Label>
            <Select id="agent-hours" options={hoursOptions} value={hours} onChange={setHours} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="escalation-email">Escalation email</Label>
            <Input
              id="escalation-email"
              type="email"
              placeholder="revops@northwind.com"
              hint="Conversations the agent can't resolve are routed here."
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <TextArea
              rows={4}
              value={description}
              onChange={setDescription}
              placeholder="What this agent owns: qualifies inbound demo requests, books meetings, and hands warm leads to the account team."
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
          <Switch label="Hand off to a person when confidence drops" defaultChecked />
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost">
              Cancel
            </Button>
            <Button size="sm" type="submit">
              Save agent
            </Button>
          </div>
        </div>
      </form>
    </ComponentCard>
  );
}
