import React from "react";
import Button from "@/components/ui/button/Button";
import ProgressBar from "@/components/ui/progress/ProgressBar";

export function CurrentPlanCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Current plan
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <h3 className="text-2xl font-bold tracking-tight text-gray-800 dark:text-white/90 md:text-3xl">
              Growth
            </h3>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              $6,000/mo
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Renews August 1, 2026 · billed monthly
          </p>
        </div>
        <Button size="sm" variant="primary">
          Upgrade plan
        </Button>
      </div>
      <div className="mt-6 border-t border-gray-100 pt-5 dark:border-gray-800">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Agent seats in use
          </span>
          <span className="font-medium text-gray-800 dark:text-white/90">
            3 of 3
          </span>
        </div>
        <ProgressBar value={100} size="sm" color="brand" />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          All seats deployed — upgrade to add a fourth agent.
        </p>
      </div>
    </div>
  );
}

export function PaymentMethodCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Payment method
      </h3>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold tracking-wide text-gray-700 dark:bg-gray-800 dark:text-white/80">
            VISA
          </span>
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              Visa •••• 4242
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Expires 09/2028
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline">
          Update
        </Button>
      </div>
      <p className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
        Charged on the 1st of each month. Receipts go to billing contacts.
      </p>
    </div>
  );
}

const contacts = [
  { name: "Rahul Bhavsar", email: "rahul@aixccelerate.com", role: "Owner" },
  { name: "Neeta Bhavsar", email: "neeta@aixccelerate.com", role: "Finance" },
];

export function BillingContactsCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Billing contacts
      </h3>
      <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
        {contacts.map((contact) => (
          <li
            key={contact.email}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-white/80">
                {contact.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {contact.name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {contact.email}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {contact.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
