"use client";
import React, { useState } from "react";
import Accordion, { AccordionItem } from "@/components/ui/accordion/Accordion";

interface FaqCategory {
  id: string;
  label: string;
  description: string;
  items: AccordionItem[];
}

const categories: FaqCategory[] = [
  {
    id: "product",
    label: "Product",
    description: "What AI revenue employees are and how they work.",
    items: [
      {
        title: "What is an AI revenue employee?",
        content:
          "An AI revenue employee is a productized AI agent that owns a complete revenue function — the way a full-time hire would. Nick runs demand generation, Jules handles outbound, Pepper qualifies inbound, Tony covers technical pre-sales, Joy manages deal operations, and George drives retention. Each one works inside your existing tools, follows your playbooks, and reports on outcomes, not activity.",
      },
      {
        title: "How is this different from a chatbot or automation tool?",
        content:
          "A chatbot answers questions; an AI revenue employee owns a job. It carries context across conversations, takes multi-step actions in your CRM and calendar, escalates to humans when needed, and is measured against the same targets you'd set for a person in the role. You're replacing headcount budget, not adding another software subscription.",
      },
      {
        title: "Which AI employee should we start with?",
        content:
          "Most teams start with Pepper (inbound qualification) or Jules (outbound), because those roles show measurable pipeline impact within the first 30 days. During onboarding we look at where your revenue team loses the most time and recommend a starting point.",
      },
    ],
  },
  {
    id: "deployment",
    label: "Deployment",
    description: "Getting from signed contract to a working agent.",
    items: [
      {
        title: "How does deployment work?",
        content:
          "Deployment runs in three phases over roughly 30 days. Week one: we connect your CRM, email, and calendar, and load your ICP, messaging, and playbooks. Week two: the agent runs in shadow mode — drafting but not sending — while your team reviews its work. From week three it goes live on a limited scope, expanding as accuracy is verified against real conversations.",
      },
      {
        title: "How long until we see results?",
        content:
          "Shadow-mode output is reviewable in the first two weeks. Most customers see qualified pipeline attributable to their AI employee within 30 to 45 days of going live. We set a baseline during onboarding so the impact is measured, not guessed.",
      },
      {
        title: "Do we need engineers on our side?",
        content:
          "No. Deployment is handled by the AIX team using native integrations. Your side needs a revenue operations owner for about two hours a week during onboarding — mostly to approve playbooks and review shadow-mode output.",
      },
    ],
  },
  {
    id: "security",
    label: "Data & security",
    description: "How your data is handled and protected.",
    items: [
      {
        title: "Is our customer data safe?",
        content:
          "Yes. Data is encrypted in transit and at rest, scoped per workspace, and never used to train shared models. Access follows least privilege: each AI employee only sees the accounts and systems it's assigned to. You can export or delete your data at any time.",
      },
      {
        title: "Does our data train models for other customers?",
        content:
          "No. Your conversations, CRM records, and playbooks stay inside your workspace. Model improvements come from anonymized product telemetry, never from your customer content.",
      },
      {
        title: "Can we control what the agent is allowed to do?",
        content:
          "Every action an agent can take — sending email, updating CRM fields, booking meetings, quoting pricing — is a permission you grant explicitly. Anything outside its scope triggers a handoff to a human with full conversation context.",
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "The tools AI employees plug into.",
    items: [
      {
        title: "Which tools do you integrate with?",
        content:
          "Native integrations cover Salesforce, HubSpot, Slack, Gmail, Linear, Stripe, Zoom, and Notion, with more added regularly. Anything with an API can be connected on Workforce plans through custom integrations.",
      },
      {
        title: "Will the agent write to our CRM?",
        content:
          "Yes — that's the point. AI employees log activities, update stages, create tasks, and keep records current so your pipeline reporting reflects reality. Write access is scoped per object and reviewable in the audit log.",
      },
    ],
  },
  {
    id: "pricing",
    label: "Pricing",
    description: "Plans, billing, and what's included.",
    items: [
      {
        title: "How does pricing work?",
        content:
          "Plans are priced per AI employee, not per seat or per conversation. Pilot starts at $2,500/mo for one AI employee, Growth is $6,000/mo for three, and Workforce is $12,000/mo for all six plus custom employees. Annual billing saves 15%.",
      },
      {
        title: "Is there a long-term commitment?",
        content:
          "Pilot runs month to month. Growth and Workforce are annual agreements — deploying a revenue team is an operating decision, not a trial — but every plan starts with a 30-day onboarding period with clear success criteria.",
      },
      {
        title: "What happens if we outgrow our plan?",
        content:
          "You upgrade mid-term and we prorate the difference. Adding an AI employee takes days, not weeks, since your integrations and playbooks are already in place.",
      },
    ],
  },
  {
    id: "handoff",
    label: "Human handoff",
    description: "Where people stay in the loop.",
    items: [
      {
        title: "When does an AI employee hand off to a human?",
        content:
          "Handoffs trigger on three conditions: the agent's confidence drops below your threshold, the conversation touches a topic you've reserved for humans (like pricing exceptions or legal terms), or the customer asks for a person. The human receives the full conversation history and suggested next steps.",
      },
      {
        title: "Can our team take over a conversation mid-thread?",
        content:
          "Yes. Any teammate can claim a conversation from the inbox at any point. The agent steps back, keeps logging context, and can resume if you hand it back.",
      },
      {
        title: "Do customers know they're talking to an AI?",
        content:
          "That's your call, and we recommend transparency. Each AI employee has a configurable identity and disclosure setting. In practice, customers care about fast, accurate answers — disclosed AI employees see no drop in response rates.",
      },
    ],
  },
];

export default function FaqContent() {
  const [activeId, setActiveId] = useState(categories[0].id);
  const active = categories.find((c) => c.id === activeId) ?? categories[0];

  return (
    <div className="flex flex-col gap-5 sm:gap-6 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">
        <nav className="flex flex-wrap gap-2 lg:flex-col">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveId(category.id)}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                category.id === activeId
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
              }`}
            >
              {category.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            {active.label}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {active.description}
          </p>
        </div>
        <Accordion key={active.id} items={active.items} defaultOpenIndex={0} />
      </div>
    </div>
  );
}
