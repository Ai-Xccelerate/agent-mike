"use client";
import React from "react";

import ComponentCard from "@/components/common/ComponentCard";
import { MailIcon } from "@/components/common/icons";

import PhoneInput from "../group-input/PhoneInput";
import Input from "../input/InputField";
import Label from "../Label";

const COUNTRIES = [
  { code: "US", label: "+1" },
  { code: "GB", label: "+44" },
  { code: "CA", label: "+1" },
  { code: "AU", label: "+61" },
];

export default function InputGroup() {
  return (
    <ComponentCard title="Input group" desc="A field with something fixed at its start or end.">
      <div className="space-y-5">
        <div>
          <Label htmlFor="ig-email">Email</Label>
          <div className="relative">
            <Input id="ig-email" placeholder="dana@fleetwise.com" type="email" className="pl-13" />
            <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center border-r border-gray-200 text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
              <MailIcon className="size-4.5" />
            </span>
          </div>
        </div>
        <div>
          <Label htmlFor="ig-phone-start">Phone</Label>
          <PhoneInput id="ig-phone-start" selectPosition="start" countries={COUNTRIES} />
        </div>
        <div>
          <Label htmlFor="ig-phone-end">Phone, code at the end</Label>
          <PhoneInput id="ig-phone-end" selectPosition="end" countries={COUNTRIES} />
        </div>
      </div>
    </ComponentCard>
  );
}
