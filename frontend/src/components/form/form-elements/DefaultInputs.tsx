"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";
import { ClockIcon } from "@/components/common/icons";
import DatePicker from "@/components/form/date-picker";
import { EyeCloseIcon, EyeIcon } from "@/icons";

import Input from "../input/InputField";
import Label from "../Label";
import Select from "../Select";

const ROLE_OPTIONS = [
  { value: "demand-gen", label: "Demand generation" },
  { value: "outbound", label: "Outbound sales" },
  { value: "inbound", label: "Inbound qualification" },
];

export default function DefaultInputs() {
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("");

  return (
    <ComponentCard title="Default inputs" desc="Text, select, password, date and time fields.">
      <div className="space-y-5">
        <div>
          <Label htmlFor="di-name">Input</Label>
          <Input id="di-name" type="text" />
        </div>
        <div>
          <Label htmlFor="di-email">Input with placeholder</Label>
          <Input id="di-email" type="email" placeholder="dana@fleetwise.com" />
        </div>
        <div>
          <Label htmlFor="di-select">Select</Label>
          <Select id="di-select" options={ROLE_OPTIONS} placeholder="Choose a role" value={role} onChange={setRole} />
        </div>
        <div>
          <Label htmlFor="di-password">Password</Label>
          <div className="relative">
            <Input
              id="di-password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 12 characters"
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
              className="focus-ring absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 transition-colors duration-150 ease-out hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
            >
              {showPassword ? (
                <EyeIcon className="size-5 fill-current" />
              ) : (
                <EyeCloseIcon className="size-5 fill-current" />
              )}
            </button>
          </div>
        </div>

        <DatePicker id="di-date" label="Date" placeholder="Choose a date" />

        <div>
          <Label htmlFor="di-time">Time</Label>
          <div className="relative">
            <Input type="time" id="di-time" name="di-time" className="pr-10" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
              <ClockIcon className="size-4.5" />
            </span>
          </div>
        </div>
        <div>
          <Label htmlFor="di-card">Card number</Label>
          <div className="relative">
            <Input id="di-card" type="text" placeholder="1234 5678 9012 3456" autoComplete="cc-number" className="pl-13 tabular-nums" />
            <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center border-r border-gray-200 dark:border-white/[0.08]">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="6.25" cy="10" r="5.625" fill="#E80B26" />
                <circle cx="13.75" cy="10" r="5.625" fill="#F59D31" />
                <path
                  d="M10 14.1924C11.1508 13.1625 11.875 11.6657 11.875 9.99979C11.875 8.33383 11.1508 6.8371 10 5.80713C8.84918 6.8371 8.125 8.33383 8.125 9.99979C8.125 11.6657 8.84918 13.1625 10 14.1924Z"
                  fill="#FC6020"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </ComponentCard>
  );
}
