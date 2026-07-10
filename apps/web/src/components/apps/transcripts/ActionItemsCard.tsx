"use client";

import React, { useState } from "react";
import AgentAvatar, { AgentName } from "@/components/aix/AgentAvatar";
import { CheckLineIcon } from "@/icons";

type Owner =
  | { kind: "human"; name: string; initials: string }
  | { kind: "agent"; name: AgentName };

interface ActionItem {
  id: number;
  text: string;
  owner: Owner;
  due: string;
  done: boolean;
}

const initialItems: ActionItem[] = [
  {
    id: 1,
    text: "Send Dana the George retention agent overview and pricing",
    owner: { kind: "human", name: "Sarah Kim", initials: "SK" },
    due: "Due Jul 7",
    done: true,
  },
  {
    id: 2,
    text: "Share updated pipeline attribution report from Nick",
    owner: { kind: "human", name: "Maya Chen", initials: "MC" },
    due: "Due Jul 8",
    done: true,
  },
  {
    id: 3,
    text: "Scope the HubSpot custom-field sync Dana asked about",
    owner: { kind: "agent", name: "Tony" },
    due: "Due Jul 10",
    done: false,
  },
  {
    id: 4,
    text: "Draft the Q3 expansion proposal with George included",
    owner: { kind: "human", name: "Rahul Bhavsar", initials: "RB" },
    due: "Due Jul 11",
    done: false,
  },
  {
    id: 5,
    text: "Book the renewal review for the week of Aug 17",
    owner: { kind: "human", name: "Sarah Kim", initials: "SK" },
    due: "Due Jul 14",
    done: false,
  },
];

function OwnerAvatar({ owner }: { owner: Owner }) {
  if (owner.kind === "agent") {
    return (
      <span title={owner.name}>
        <AgentAvatar name={owner.name} size="sm" />
      </span>
    );
  }
  return (
    <span
      title={owner.name}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300"
    >
      {owner.initials}
    </span>
  );
}

export default function ActionItemsCard() {
  const [items, setItems] = useState(initialItems);
  const doneCount = items.filter((i) => i.done).length;

  const toggle = (id: number) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i))
    );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800 md:px-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Action items
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {doneCount} of {items.length} done
        </span>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-5 py-3.5 md:px-6">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              aria-pressed={item.done}
              aria-label={item.done ? "Mark as not done" : "Mark as done"}
              className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                item.done
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-gray-300 bg-transparent hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600"
              }`}
            >
              {item.done && <CheckLineIcon className="size-3.5" />}
            </button>
            <p
              className={`min-w-0 flex-1 text-sm ${
                item.done
                  ? "text-gray-400 line-through dark:text-gray-500"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {item.text}
            </p>
            <span className="hidden shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-theme-xs font-medium text-gray-600 dark:bg-white/5 dark:text-gray-400 sm:inline-flex">
              {item.due}
            </span>
            <OwnerAvatar owner={item.owner} />
          </li>
        ))}
      </ul>
    </div>
  );
}
