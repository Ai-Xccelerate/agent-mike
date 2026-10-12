"use client";

import { createContext, useContext } from "react";
import type { ChoicesCard, HelpdeskTicketCard } from "@/lib/customer-cards";

/**
 * What a card in a customer reply can do in the chat panel: quick replies
 * send their text as the customer's next message, and only the newest
 * reply's ones can still be tapped.
 */
export type CustomerCardsContextValue = {
  busy: boolean;
  onReply: (text: string) => void;
};

export const CustomerCardsContext = createContext<CustomerCardsContextValue>({ busy: false, onReply: () => undefined });

/** Whether the card belongs to the newest reply. Set per message by the panel. */
export const LatestReplyContext = createContext(false);

export function ChoicesView({ data }: { data: ChoicesCard }) {
  const { busy, onReply } = useContext(CustomerCardsContext);
  const latest = useContext(LatestReplyContext);
  // Older questions have been answered; their buttons would only confuse.
  if (!latest || !data.options?.length) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick replies">
      {data.options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={busy}
          onClick={() => onReply(option)}
          className="rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-500/30 dark:bg-white/[0.03] dark:text-brand-300 dark:hover:bg-brand-500/10"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function HelpdeskTicketView({ data }: { data: HelpdeskTicketCard }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {data.created ? "Ticket raised" : "Added to your ticket"}
        </span>
        <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          {data.key}
        </span>
      </div>
      {data.title && <p className="mt-1.5 text-sm font-medium leading-5 text-gray-800 dark:text-white/90">{data.title}</p>}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {[data.requestType, "A teammate will follow up"].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

export function CardSkeleton() {
  return <div className="h-10 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />;
}
