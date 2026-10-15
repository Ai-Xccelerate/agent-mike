"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, fieldClass, hintClass, labelClass, sectionHintClass, sectionTitleClass } from "@/components/worker/settings/ui";
import { DEFAULT_TICKET_SCHEMA, resolveTicketSchema } from "@/lib/tickets";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { TicketSchema } from "@/lib/worker-api";
import { useState } from "react";

type ListKey = keyof TicketSchema;

const MAX_LENGTH = 40;

const LISTS: { key: ListKey; title: string; hint: string; placeholder: string; required: boolean }[] = [
  {
    key: "requestTypes",
    title: "Request types",
    hint: "What a customer is asking for. With a helpdesk connected, its own request types are used instead.",
    placeholder: "Add a request type",
    required: true,
  },
  {
    key: "tiers",
    title: "Tiers",
    hint: "From the simplest issue to the hardest. The first is the lowest tier.",
    placeholder: "Add a tier",
    required: true,
  },
  {
    key: "labels",
    title: "Labels",
    hint: "Tags the worker may put on a ticket. It only uses labels from this list.",
    placeholder: "Add a label",
    required: false,
  },
];

function WordList({
  title,
  hint,
  placeholder,
  items,
  required,
  onChange,
}: {
  title: string;
  hint: string;
  placeholder: string;
  items: string[];
  required: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const clean = draft.trim();
  const duplicate = items.some((item) => item.toLowerCase() === clean.toLowerCase());

  function add() {
    if (!clean || duplicate) return;
    onChange([...items, clean]);
    setDraft("");
  }

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>{title}</h2>
      <p className={sectionHintClass}>{hint}</p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={title}>
        {items.map((item, index) => (
          <li
            key={item}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 py-1 pl-2.5 pr-1.5 text-sm text-gray-800 dark:border-gray-700 dark:text-gray-200"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              disabled={required && items.length === 1}
              onClick={() => onChange(items.filter((_, position) => position !== index))}
              className="flex size-5 items-center justify-center rounded text-gray-400 hover:bg-gray-900/[0.06] hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
            >
              x
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-gray-500 dark:text-gray-400">None. The worker adds no labels.</li>}
      </ul>
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">{placeholder}</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_LENGTH}
            placeholder={placeholder}
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          disabled={!clean || duplicate}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-900/[0.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          Add
        </button>
      </form>
      {duplicate && <span className={hintClass}>That one is already in the list.</span>}
    </section>
  );
}

export default function TicketsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  const schema = resolveTicketSchema(profile.ticketSchema);
  const usingDefaults = profile.ticketSchema === null;

  function setList(key: ListKey, next: string[]) {
    update("ticketSchema", { ...schema, [key]: next });
  }

  return (
    <>
      <SettingsPageHeader
        title="Tickets"
        description="The request types, tiers and labels this worker sorts tickets with."
        onSave={() => save(["ticketSchema"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />
      <div className="flex flex-col gap-4 md:gap-6">
        {LISTS.map((list) => (
          <WordList
            key={list.key}
            title={list.title}
            hint={list.hint}
            placeholder={list.placeholder}
            items={schema[list.key]}
            required={list.required}
            onChange={(next) => setList(list.key, next)}
          />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`${labelClass} font-normal text-gray-500 dark:text-gray-400`}>
            {usingDefaults ? "Using the built-in lists." : "Using this worker's own lists."} The worker sorts a ticket after it has answered, and again when it hands
            the conversation to a person. A change a person makes on a ticket is never overwritten.
          </p>
          {!usingDefaults && (
            <button
              type="button"
              onClick={() => update("ticketSchema", null)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-900/[0.04] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            >
              Use the built-in lists
            </button>
          )}
        </div>
        {usingDefaults && (
          <p className={hintClass}>
            Built-in: {DEFAULT_TICKET_SCHEMA.requestTypes.length} request types, {DEFAULT_TICKET_SCHEMA.tiers.length} tiers, {DEFAULT_TICKET_SCHEMA.labels.length} labels. Edit any list to make it this worker&apos;s own.
          </p>
        )}
      </div>
    </>
  );
}
