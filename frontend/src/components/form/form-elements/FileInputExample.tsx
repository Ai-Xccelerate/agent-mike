"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";

import FileInput from "../input/FileInput";
import Label from "../Label";

export default function FileInputExample() {
  const [file, setFile] = useState<string | null>(null);

  return (
    <ComponentCard title="File input">
      <div>
        <Label htmlFor="fi-upload">Price list</Label>
        <FileInput
          id="fi-upload"
          accept=".pdf,.csv,.xlsx"
          onChange={(event) => setFile(event.target.files?.[0]?.name ?? null)}
        />
        <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">
          {file ? `Ready to upload: ${file}` : "PDF, CSV or Excel, up to 10 MB."}
        </p>
      </div>
    </ComponentCard>
  );
}
