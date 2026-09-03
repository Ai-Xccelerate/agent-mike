"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import Switch from "@/components/form/switch/Switch";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import { FileIcon } from "@/icons";

const categoryOptions = [
  { value: "Agent seat", label: "Agent seat" },
  { value: "Add-on", label: "Add-on" },
  { value: "Training", label: "Training" },
];

const billingOptions = [
  { value: "Monthly", label: "Monthly" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "One-time", label: "One-time" },
];

const billingSuffix: Record<string, string> = {
  Monthly: "/mo",
  Quarterly: "/qtr",
  "One-time": " one-time",
};

function formatPrice(price: string, billing: string): string {
  const numeric = Number(price);
  if (!price || Number.isNaN(numeric)) return "—";
  return `$${numeric.toLocaleString("en-US")}${billingSuffix[billing] ?? ""}`;
}

export default function AddProductForm() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [billing, setBilling] = useState("Monthly");
  const [active, setActive] = useState(true);
  const [imageName, setImageName] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setImageName(acceptedFiles[0].name);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [],
      "image/jpeg": [],
      "image/webp": [],
      "image/svg+xml": [],
    },
    maxFiles: 1,
  });

  const monogram = name
    ? name
        .split(/[\s—-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
      <div
        data-aix-id="AIX-051.1"
        className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 lg:col-span-2"
      >
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Product details
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Agent seats, add-ons, and training packs in the AIX catalog.
        </p>

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="product-name">Product name</Label>
              <Input
                id="product-name"
                placeholder="e.g. Nick — Demand gen seat"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                options={categoryOptions}
                placeholder="Select a category"
                onChange={setCategory}
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <TextArea
              rows={4}
              placeholder="What this product does and who it's for — e.g. an AI revenue employee that books qualified demand gen meetings."
              value={description}
              onChange={setDescription}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="product-price">Price (USD)</Label>
              <Input
                id="product-price"
                type="number"
                placeholder="4000"
                min="0"
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <Label>Billing period</Label>
              <Select
                options={billingOptions}
                placeholder="Select billing period"
                defaultValue="Monthly"
                onChange={setBilling}
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5 dark:border-gray-800">
            <Switch
              label="Active — visible in the catalog"
              defaultChecked
              onChange={setActive}
            />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
            <Button size="sm" variant="outline">
              Cancel
            </Button>
            <Button size="sm" variant="primary">
              Save product
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 md:space-y-6">
        <div
          data-aix-id="AIX-051.2"
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
        >
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Product image
          </h3>
          <div
            {...getRootProps()}
            className={`mt-4 cursor-pointer rounded-xl border border-dashed p-6 text-center transition-colors duration-150 ${
              isDragActive
                ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                : "border-gray-300 bg-gray-50 hover:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500"
            }`}
          >
            <input {...getInputProps()} />
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-white/80">
              <FileIcon className="size-5" />
            </div>
            {imageName ? (
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {imageName}
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isDragActive
                  ? "Drop the image here"
                  : "Drag an image here, or click to browse"}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              PNG, JPG, WebP, or SVG
            </p>
          </div>
        </div>

        <div
          data-aix-id="AIX-051.3"
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
        >
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Summary
          </h3>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-white/80">
              {monogram}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {name || "Untitled product"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {category || "No category yet"}
              </p>
            </div>
          </div>
          <dl className="mt-5 space-y-3 border-t border-gray-100 pt-4 text-sm dark:border-gray-800">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">Price</dt>
              <dd className="font-semibold text-gray-800 dark:text-white/90">
                {formatPrice(price, billing)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">Billing</dt>
              <dd className="text-gray-700 dark:text-gray-300">{billing}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">Status</dt>
              <dd>
                <Badge
                  variant="light"
                  size="sm"
                  color={active ? "success" : "light"}
                >
                  {active ? "Active" : "Draft"}
                </Badge>
              </dd>
            </div>
          </dl>
          {description && (
            <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
