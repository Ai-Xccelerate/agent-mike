"use client";

import React from "react";
import DataTableOne, { Column } from "@/components/tables/DataTable/DataTableOne";
import Badge from "@/components/ui/badge/Badge";

type ProductCategory = "Agent seat" | "Add-on" | "Training";
type ProductStatus = "Active" | "Draft";

interface Product extends Record<string, unknown> {
  name: string;
  monogram: string;
  category: ProductCategory;
  price: string;
  status: ProductStatus;
  updated: string;
}

const products: Product[] = [
  { name: "Nick — Demand gen seat", monogram: "NI", category: "Agent seat", price: "$4,000/mo", status: "Active", updated: "2 hr ago" },
  { name: "Jules — Outbound seat", monogram: "JU", category: "Agent seat", price: "$4,000/mo", status: "Active", updated: "5 hr ago" },
  { name: "Pepper — Inbound seat", monogram: "PE", category: "Agent seat", price: "$4,000/mo", status: "Active", updated: "Yesterday" },
  { name: "Tony — Technical seat", monogram: "TO", category: "Agent seat", price: "$4,500/mo", status: "Active", updated: "Yesterday" },
  { name: "Joy — Deal ops seat", monogram: "JO", category: "Agent seat", price: "$4,500/mo", status: "Active", updated: "2 days ago" },
  { name: "George — Retention seat", monogram: "GE", category: "Agent seat", price: "$4,000/mo", status: "Active", updated: "3 days ago" },
  { name: "Custom agent build", monogram: "CA", category: "Add-on", price: "$25,000 one-time", status: "Active", updated: "4 days ago" },
  { name: "AI fluency workshop", monogram: "AF", category: "Training", price: "$7,500 one-time", status: "Active", updated: "1 week ago" },
  { name: "Extra conversation pack", monogram: "EC", category: "Add-on", price: "$1,200/mo", status: "Active", updated: "1 week ago" },
  { name: "CRM integration setup", monogram: "CR", category: "Add-on", price: "$3,500 one-time", status: "Active", updated: "2 weeks ago" },
  { name: "Priority support tier", monogram: "PS", category: "Add-on", price: "$900/mo", status: "Active", updated: "2 weeks ago" },
  { name: "Onboarding sprint", monogram: "OS", category: "Training", price: "$5,000 one-time", status: "Active", updated: "3 weeks ago" },
  { name: "Prompt engineering clinic", monogram: "PC", category: "Training", price: "$2,500 one-time", status: "Draft", updated: "3 weeks ago" },
  { name: "Voice channel add-on", monogram: "VC", category: "Add-on", price: "$1,800/mo", status: "Draft", updated: "1 month ago" },
  { name: "Multi-language pack", monogram: "ML", category: "Add-on", price: "$1,500/mo", status: "Draft", updated: "1 month ago" },
  { name: "Executive AI briefing", monogram: "EB", category: "Training", price: "$4,000 one-time", status: "Draft", updated: "1 month ago" },
  { name: "Sandbox environment", monogram: "SE", category: "Add-on", price: "$600/mo", status: "Active", updated: "1 month ago" },
  { name: "Quarterly tune-up", monogram: "QT", category: "Add-on", price: "$2,000/qtr", status: "Active", updated: "2 months ago" },
];

const categoryColor: Record<ProductCategory, "primary" | "info" | "light"> = {
  "Agent seat": "primary",
  "Add-on": "light",
  Training: "info",
};

const statusColor: Record<ProductStatus, "success" | "light"> = {
  Active: "success",
  Draft: "light",
};

const columns: Column<Product>[] = [
  {
    key: "name",
    header: "Product",
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-white/80">
          {row.monogram}
        </span>
        <span className="font-medium text-gray-800 dark:text-white/90">
          {row.name}
        </span>
      </div>
    ),
  },
  {
    key: "category",
    header: "Category",
    sortable: true,
    render: (row) => (
      <Badge variant="light" size="sm" color={categoryColor[row.category]}>
        {row.category}
      </Badge>
    ),
  },
  { key: "price", header: "Price", sortable: true },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (row) => (
      <Badge variant="light" size="sm" color={statusColor[row.status]}>
        {row.status}
      </Badge>
    ),
  },
  { key: "updated", header: "Updated", sortable: false },
];

export default function ProductsTable() {
  return (
    <DataTableOne
      columns={columns}
      data={products}
      searchPlaceholder="Search products..."
    />
  );
}
