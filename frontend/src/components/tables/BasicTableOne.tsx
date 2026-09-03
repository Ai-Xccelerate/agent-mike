import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";

import Badge from "../ui/badge/Badge";
import Image from "next/image";

interface Order {
  id: number;
  user: {
    image: string;
    name: string;
    role: string;
  };
  projectName: string;
  team: {
    images: string[];
  };
  status: string;
  budget: string;
}

// Define the table data using the interface
const tableData: Order[] = [
  {
    id: 1,
    user: {
      image: "/images/user/user-17.jpg",
      name: "Maya Chen",
      role: "Account Executive",
    },
    projectName: "Acme Inc. — Nick rollout",
    team: {
      images: [
        "/images/user/user-22.jpg",
        "/images/user/user-23.jpg",
        "/images/user/user-24.jpg",
      ],
    },
    budget: "$3,900",
    status: "Active",
  },
  {
    id: 2,
    user: {
      image: "/images/user/user-18.jpg",
      name: "Sam Okafor",
      role: "Solutions Engineer",
    },
    projectName: "Globex — Jules pilot",
    team: {
      images: ["/images/user/user-25.jpg", "/images/user/user-26.jpg"],
    },
    budget: "$24,900",
    status: "Pending",
  },
  {
    id: 3,
    user: {
      image: "/images/user/user-17.jpg",
      name: "Priya Nair",
      role: "Onboarding Lead",
    },
    projectName: "Initech — Pepper triage",
    team: {
      images: ["/images/user/user-27.jpg"],
    },
    budget: "$12,700",
    status: "Active",
  },
  {
    id: 4,
    user: {
      image: "/images/user/user-20.jpg",
      name: "Rahul Bhavsar",
      role: "Success Manager",
    },
    projectName: "Umbrella — Tony knowledge base",
    team: {
      images: [
        "/images/user/user-28.jpg",
        "/images/user/user-29.jpg",
        "/images/user/user-30.jpg",
      ],
    },
    budget: "$2,800",
    status: "Cancelled",
  },
  {
    id: 5,
    user: {
      image: "/images/user/user-21.jpg",
      name: "Diego Martins",
      role: "Revenue Ops",
    },
    projectName: "Soylent — George retention",
    team: {
      images: [
        "/images/user/user-31.jpg",
        "/images/user/user-32.jpg",
        "/images/user/user-33.jpg",
      ],
    },
    budget: "$4,500",
    status: "Active",
  },
];

export default function BasicTableOne() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      {/* Mobile: stacked cards — no horizontal scroll. */}
      <div className="space-y-3 p-4 md:hidden">
        {tableData.map((order) => (
          <div
            key={order.id}
            className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
                  <Image
                    width={40}
                    height={40}
                    src={order.user.image}
                    alt={order.user.name}
                  />
                </div>
                <div className="min-w-0">
                  <span className="block truncate font-medium text-gray-800 text-theme-sm dark:text-white/90">
                    {order.user.name}
                  </span>
                  <span className="block truncate text-gray-500 text-theme-xs dark:text-gray-400">
                    {order.user.role}
                  </span>
                </div>
              </div>
              <Badge
                size="sm"
                color={
                  order.status === "Active"
                    ? "success"
                    : order.status === "Pending"
                    ? "warning"
                    : "error"
                }
              >
                {order.status}
              </Badge>
            </div>
            <dl className="mt-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">
                  Project
                </dt>
                <dd className="truncate text-right text-theme-sm text-gray-700 dark:text-gray-300">
                  {order.projectName}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">
                  Team
                </dt>
                <dd className="flex -space-x-2">
                  {order.team.images.map((teamImage, index) => (
                    <div
                      key={index}
                      className="h-6 w-6 overflow-hidden rounded-full border-2 border-white dark:border-gray-900"
                    >
                      <Image
                        width={24}
                        height={24}
                        src={teamImage}
                        alt={`Team member ${index + 1}`}
                        className="w-full"
                      />
                    </div>
                  ))}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">
                  Budget
                </dt>
                <dd className="text-right text-theme-sm font-medium text-gray-700 tabular-nums dark:text-gray-300">
                  {order.budget}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {/* Desktop: table. */}
      <div className="hidden max-w-full overflow-x-auto md:block">
        <div className="min-w-[1102px]">
          <Table>
            {/* Table Header */}
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  User
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Project Name
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Team
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Status
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Budget
                </TableCell>
              </TableRow>
            </TableHeader>

            {/* Table Body */}
            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {tableData.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="px-5 py-4 sm:px-6 text-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 overflow-hidden rounded-full">
                        <Image
                          width={40}
                          height={40}
                          src={order.user.image}
                          alt={order.user.name}
                        />
                      </div>
                      <div>
                        <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {order.user.name}
                        </span>
                        <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                          {order.user.role}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.projectName}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <div className="flex -space-x-2">
                      {order.team.images.map((teamImage, index) => (
                        <div
                          key={index}
                          className="w-6 h-6 overflow-hidden border-2 border-white rounded-full dark:border-gray-900"
                        >
                          <Image
                            width={24}
                            height={24}
                            src={teamImage}
                            alt={`Team member ${index + 1}`}
                            className="w-full"
                          />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <Badge
                      size="sm"
                      color={
                        order.status === "Active"
                          ? "success"
                          : order.status === "Pending"
                          ? "warning"
                          : "error"
                      }
                    >
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                    {order.budget}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
