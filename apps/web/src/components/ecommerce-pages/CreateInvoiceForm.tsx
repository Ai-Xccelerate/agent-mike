"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import { PlusIcon, TrashBinIcon } from "@/icons";

interface LineItem {
  id: number;
  description: string;
  qty: number;
  rate: number;
}

const clientOptions = [
  { value: "meridian", label: "Meridian Logistics" },
  { value: "harbor", label: "Harbor Point Manufacturing" },
  { value: "crestline", label: "Crestline Medical Supply" },
  { value: "bluebonnet", label: "Bluebonnet Industrial Group" },
];

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const TAX_RATE = 0.08;

export default function CreateInvoiceForm() {
  const [items, setItems] = useState<LineItem[]>([
    { id: 1, description: "Jules — outbound AI SDR seat", qty: 2, rate: 4200 },
    { id: 2, description: "Onboarding & AI fluency workshop", qty: 1, rate: 6500 },
  ]);
  const [notes, setNotes] = useState("");
  const [nextId, setNextId] = useState(3);

  const addItem = () => {
    setItems([...items, { id: nextId, description: "", qty: 1, rate: 0 }]);
    setNextId(nextId + 1);
  };

  const removeItem = (id: number) => {
    setItems(items.filter((it) => it.id !== id));
  };

  const updateItem = (
    id: number,
    field: "description" | "qty" | "rate",
    value: string
  ) => {
    setItems(
      items.map((it) =>
        it.id === id
          ? {
              ...it,
              [field]:
                field === "description" ? value : Math.max(0, Number(value) || 0),
            }
          : it
      )
    );
  };

  const subtotal = items.reduce((sum, it) => sum + it.qty * it.rate, 0);
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = subtotal + tax;

  return (
    <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-3">
      {/* Left: invoice form */}
      <div
        data-aix-id="AIX-055.1"
        className="space-y-5 sm:space-y-6 lg:col-span-2"
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Invoice details
          </h3>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Label htmlFor="invoice-client">Client</Label>
              <Select
                options={clientOptions}
                placeholder="Select a client"
                onChange={() => {}}
                defaultValue="meridian"
              />
            </div>
            <div>
              <Label htmlFor="invoice-number">Invoice number</Label>
              <Input id="invoice-number" defaultValue="INV-2026-0043" />
            </div>
            <div>
              <Label htmlFor="issue-date">Issue date</Label>
              <Input id="issue-date" type="date" defaultValue="2026-07-04" />
            </div>
            <div>
              <Label htmlFor="due-date">Due date</Label>
              <Input id="due-date" type="date" defaultValue="2026-08-03" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Line items
            </h3>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 transition-colors duration-150 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500/50"
            >
              <PlusIcon className="size-4" />
              Add line item
            </button>
          </div>

          {/* Column headers (sm+) */}
          <div className="mt-5 hidden grid-cols-12 gap-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:grid">
            <div className="col-span-6">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Rate</div>
            <div className="col-span-1 text-right">Amount</div>
            <div className="col-span-1" />
          </div>

          <div className="mt-3 space-y-4 sm:space-y-3">
            {items.map((it) => (
              <div
                key={it.id}
                className="grid grid-cols-12 items-center gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800 sm:border-0 sm:p-0"
              >
                <div className="col-span-12 sm:col-span-6">
                  <Input
                    placeholder="e.g. Pepper — inbound response seat"
                    defaultValue={it.description}
                    onChange={(e) =>
                      updateItem(it.id, "description", e.target.value)
                    }
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    min="0"
                    defaultValue={it.qty}
                    onChange={(e) => updateItem(it.id, "qty", e.target.value)}
                    className="text-right"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step={50}
                    defaultValue={it.rate}
                    onChange={(e) => updateItem(it.id, "rate", e.target.value)}
                    className="text-right"
                  />
                </div>
                <div className="col-span-3 text-right text-sm font-medium text-gray-800 dark:text-white/90 sm:col-span-1">
                  {fmt(it.qty * it.rate)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    disabled={items.length === 1}
                    aria-label="Remove line item"
                    className="text-gray-400 transition-colors duration-150 hover:text-error-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-500 dark:hover:text-error-500"
                  >
                    <TrashBinIcon className="size-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <Label>Notes</Label>
          <TextArea
            rows={4}
            value={notes}
            onChange={setNotes}
            placeholder="Payment terms, PO references, or a thank-you note for the client…"
          />
        </div>
      </div>

      {/* Right: sticky summary */}
      <div data-aix-id="AIX-055.2" className="lg:sticky lg:top-24">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Summary
          </h3>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                Subtotal
              </span>
              <span className="font-medium text-gray-800 dark:text-white/90">
                {fmt(subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Tax (8%)</span>
              <span className="font-medium text-gray-800 dark:text-white/90">
                {fmt(tax)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-800">
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Total
              </span>
              <span className="text-2xl font-bold tracking-tight text-gray-800 dark:text-white/90">
                {fmt(total)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {items.length} line item{items.length === 1 ? "" : "s"} · due Aug
            3, 2026
          </p>
          <div className="mt-5 space-y-3">
            <Button size="sm" variant="primary" className="w-full">
              Create invoice
            </Button>
            <Button size="sm" variant="outline" className="w-full">
              Save draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
