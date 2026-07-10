"use client";
import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import { PlusIcon, LockIcon } from "@/icons";

type Scope = "Read only" | "Read & write" | "Admin";

interface ApiKey {
  id: string;
  name: string;
  maskedKey: string;
  created: string;
  lastUsed: string;
  scope: Scope;
}

const initialKeys: ApiKey[] = [
  {
    id: "key_1",
    name: "Production backend",
    maskedKey: "aix_sk_••••4f2a",
    created: "Mar 12, 2026",
    lastUsed: "2 min ago",
    scope: "Read & write",
  },
  {
    id: "key_2",
    name: "Analytics pipeline",
    maskedKey: "aix_sk_••••c918",
    created: "Apr 03, 2026",
    lastUsed: "Yesterday",
    scope: "Read only",
  },
  {
    id: "key_3",
    name: "Staging environment",
    maskedKey: "aix_sk_••••7b3e",
    created: "May 21, 2026",
    lastUsed: "3 days ago",
    scope: "Read & write",
  },
  {
    id: "key_4",
    name: "Admin CLI",
    maskedKey: "aix_sk_••••a0d6",
    created: "Jun 18, 2026",
    lastUsed: "Never",
    scope: "Admin",
  },
];

const scopeOptions = [
  { value: "Read only", label: "Read only" },
  { value: "Read & write", label: "Read & write" },
  { value: "Admin", label: "Admin" },
];

const scopeBadgeColor: Record<Scope, "light" | "info" | "warning"> = {
  "Read only": "light",
  "Read & write": "info",
  Admin: "warning",
};

function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 6);
}

export default function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<Scope>("Read only");
  const { isOpen, openModal, closeModal } = useModal();

  const createKey = () => {
    const name = newName.trim();
    if (!name) return;
    setKeys((prev) => [
      ...prev,
      {
        id: `key_${Date.now()}`,
        name,
        maskedKey: `aix_sk_••••${randomSuffix()}`,
        created: "Jul 04, 2026",
        lastUsed: "Never",
        scope: newScope,
      },
    ]);
    setNewName("");
    setNewScope("Read only");
    closeModal();
  };

  const revokeKey = (id: string) => {
    setKeys((prev) => prev.filter((key) => key.id !== id));
  };

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              API keys
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Keys authenticate your systems against the AIX platform API.
            </p>
          </div>
          <div>
            <Button
              size="sm"
              onClick={openModal}
              startIcon={<PlusIcon className="size-5" />}
            >
              Create key
            </Button>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800">
          {keys.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                <LockIcon className="size-5 text-gray-400" />
              </span>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No API keys yet — create one to connect your first system.
              </p>
              <Button size="sm" variant="outline" onClick={openModal}>
                Create key
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile: stacked cards — no horizontal scroll. */}
              <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
                {keys.map((key) => (
                  <div key={key.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                          {key.name}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-theme-xs text-gray-500 dark:text-gray-400">
                          {key.maskedKey}
                        </p>
                      </div>
                      <Badge
                        variant="light"
                        color={scopeBadgeColor[key.scope]}
                        size="sm"
                      >
                        {key.scope}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                          Created
                        </dt>
                        <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                          {key.created}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                          Last used
                        </dt>
                        <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                          {key.lastUsed}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => revokeKey(key.id)}
                        className="text-sm font-medium text-error-600 transition-colors duration-150 hover:text-error-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-error-500 dark:hover:text-error-400"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: full table. */}
              <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-100 dark:border-gray-800">
                  {["Name", "Key", "Created", "Last used", "Scope", ""].map(
                    (heading, i) => (
                      <TableCell
                        key={i}
                        isHeader
                        className="whitespace-nowrap px-5 py-3 text-left text-theme-xs font-medium text-gray-500 dark:text-gray-400 md:px-6"
                      >
                        {heading}
                      </TableCell>
                    )
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow
                    key={key.id}
                    className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                  >
                    <TableCell className="whitespace-nowrap px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90 md:px-6">
                      {key.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-4 font-mono text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {key.maskedKey}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {key.created}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {key.lastUsed}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-4 md:px-6">
                      <Badge
                        variant="light"
                        color={scopeBadgeColor[key.scope]}
                        size="sm"
                      >
                        {key.scope}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-4 text-right md:px-6">
                      <button
                        onClick={() => revokeKey(key.id)}
                        className="text-sm font-medium text-error-600 transition-colors duration-150 hover:text-error-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-error-500 dark:hover:text-error-400"
                      >
                        Revoke
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[500px] p-5 lg:p-8">
        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Create API key
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You&apos;ll see the full key once, right after it&apos;s created.
          </p>
          <div className="mt-6 space-y-5">
            <div>
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                type="text"
                placeholder="e.g. Production backend"
                defaultValue={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <Label>Scope</Label>
              <Select
                options={scopeOptions}
                placeholder="Select a scope"
                defaultValue="Read only"
                onChange={(value) => setNewScope(value as Scope)}
              />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button size="sm" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button size="sm" onClick={createKey}>
              Create key
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
