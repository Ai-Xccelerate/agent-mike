"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import { CheckLineIcon } from "@/icons";

interface Plan {
  name: string;
  monthly: number;
  description: string;
  cta: string;
  highlighted?: boolean;
  features: string[];
}

const plans: Plan[] = [
  {
    name: "Pilot",
    monthly: 2500,
    description: "Prove the model with one AI employee on one workflow.",
    cta: "Start a pilot",
    features: [
      "1 AI revenue employee",
      "1 workflow (inbound or outbound)",
      "CRM integration included",
      "Human handoff & escalation",
      "Email support",
      "30-day onboarding",
    ],
  },
  {
    name: "Growth",
    monthly: 6000,
    description: "A revenue pod that covers demand gen through deal ops.",
    cta: "Choose Growth",
    highlighted: true,
    features: [
      "3 AI revenue employees",
      "Unlimited workflows",
      "CRM, Slack & calendar integrations",
      "Custom playbooks per account",
      "Weekly performance reviews",
      "Dedicated success manager",
      "Priority support",
    ],
  },
  {
    name: "Workforce",
    monthly: 12000,
    description: "The full AI workforce, plus custom employees built for you.",
    cta: "Talk to sales",
    features: [
      "All 6 AI revenue employees",
      "Custom AI employees included",
      "Every integration we support",
      "SSO & advanced security controls",
      "Quarterly business reviews",
      "SLA-backed uptime",
      "White-glove onboarding",
    ],
  },
];

function formatPrice(monthly: number, annual: boolean): number {
  return annual ? Math.round(monthly * 0.85) : monthly;
}

export default function PricingTables() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90 md:text-2xl">
            Scale revenue without scaling headcount
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Every plan deploys AI revenue employees that do the work of full-time
            hires — at a fraction of the cost.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          <button
            onClick={() => setAnnual(false)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 ${
              !annual
                ? "bg-white text-gray-800 shadow-theme-xs dark:bg-white/10 dark:text-white/90"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 ${
              annual
                ? "bg-white text-gray-800 shadow-theme-xs dark:bg-white/10 dark:text-white/90"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Annual
            <span className="ml-1.5 text-xs text-success-600 dark:text-success-500">
              save 15%
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border bg-white p-5 transition-colors duration-150 dark:bg-white/[0.03] md:p-6 ${
              plan.highlighted
                ? "border-brand-500 dark:border-brand-500"
                : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
            }`}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="solid" color="primary" size="sm">
                  Most popular
                </Badge>
              </div>
            )}
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {plan.name}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {plan.description}
            </p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight tabular-nums text-gray-800 dark:text-white/90">
                ${formatPrice(plan.monthly, annual).toLocaleString()}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                /mo{annual ? ", billed annually" : ""}
              </span>
            </div>
            <div className="mt-5">
              <Button
                size="sm"
                variant={plan.highlighted ? "primary" : "outline"}
                className="w-full"
              >
                {plan.cta}
              </Button>
            </div>
            <ul className="mt-6 space-y-3 border-t border-gray-100 pt-5 dark:border-gray-800">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300"
                >
                  <CheckLineIcon className="mt-0.5 size-4 shrink-0 text-success-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
        All plans capture headcount budget, not software budget. Need something
        specific? We&apos;ll build a plan around your team.
      </p>
    </div>
  );
}
