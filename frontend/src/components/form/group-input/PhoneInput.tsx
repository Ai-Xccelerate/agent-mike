"use client";
import React, { useState } from "react";
import Select from "@/components/form/Select";

interface CountryCode {
  code: string;
  label: string;
}

interface PhoneInputProps {
  countries: CountryCode[];
  placeholder?: string;
  onChange?: (phoneNumber: string) => void;
  selectPosition?: "start" | "end"; // Dropdown position within the field
  /** The number field's id, for a `Label`'s `htmlFor`. */
  id?: string;
}

/**
 * A phone number with its country code (LIB-PHONEINPUT): one `field`-styled
 * box holding a borderless country picker and the number, split by a hairline.
 * The box takes the focus ring while either part has the focus.
 */
const PhoneInput: React.FC<PhoneInputProps> = ({
  countries,
  placeholder = "+1 (555) 000-0000",
  onChange,
  selectPosition = "start",
  id,
}) => {
  const [selectedCountry, setSelectedCountry] = useState<string>("US");
  const [phoneNumber, setPhoneNumber] = useState<string>("+1");

  const countryCodes: Record<string, string> = countries.reduce(
    (acc, { code, label }) => ({ ...acc, [code]: label }),
    {}
  );

  const handleCountryChange = (newCountry: string) => {
    setSelectedCountry(newCountry);
    setPhoneNumber(countryCodes[newCountry]);
    onChange?.(countryCodes[newCountry]);
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(e.target.value);
    onChange?.(e.target.value);
  };

  const countrySelect = (
    <div className="w-[84px] shrink-0 px-1">
      <Select
        variant="ghost"
        size="sm"
        value={selectedCountry}
        onChange={handleCountryChange}
        ariaLabel="Country code"
        options={countries.map((c) => ({ value: c.code, label: c.code }))}
      />
    </div>
  );

  const divider = <span aria-hidden="true" className="h-6 w-px shrink-0 bg-gray-200 dark:bg-white/[0.08]" />;

  return (
    <div className="flex h-10 w-full items-center rounded-lg border border-gray-300 bg-transparent shadow-theme-xs transition-colors duration-150 ease-out focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/20 hover:border-gray-400 dark:border-white/[0.08] dark:hover:border-white/[0.16] dark:focus-within:border-brand-500">
      {selectPosition === "start" && (
        <>
          {countrySelect}
          {divider}
        </>
      )}
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phoneNumber}
        onChange={handlePhoneNumberChange}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent px-3 text-sm tabular-nums text-gray-800 placeholder:text-gray-500 focus:outline-hidden dark:text-white/90 dark:placeholder:text-gray-400"
      />
      {selectPosition === "end" && (
        <>
          {divider}
          {countrySelect}
        </>
      )}
    </div>
  );
};

export default PhoneInput;
