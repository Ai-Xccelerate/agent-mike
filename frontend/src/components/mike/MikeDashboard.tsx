"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import AgentHero from "@/components/aix/dashboards/AgentHero";
import StatCard from "@/components/aix/StatCard";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ChatIcon, CheckCircleIcon, DocsIcon, MailIcon, UserCircleIcon } from "@/icons";
import { apiFetch, Conversation, KnowledgeDocument } from "@/lib/mike-api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Stats = {
  open_conversations: number;
  resolved_today: number;
  needs_human: number;
  auto_resolution_rate: number;
  avg_confidence: number;
};

const emptyStats: Stats = {
  open_conversations: 0,
  resolved_today: 0,
  needs_human: 0,
  auto_resolution_rate: 0,
  avg_confidence: 0,
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function MikeDashboard() {
  const [stats, setStats] = useState(emptyStats);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeDocument[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    apiFetch<Stats>("/dashboard")
      .then((data) => {
        setStats(data);
        setConnected(true);
      })
      .catch(() => setConnected(false));
    apiFetch<Conversation[]>("/conversations").then(setConversations).catch(() => undefined);
    apiFetch<KnowledgeDocument[]>("/knowledge").then(setKnowledge).catch(() => undefined);
  }, []);

  const recent = useMemo(
    () => conversations.filter((c) => c.status !== "resolved" && c.status !== "closed").slice(0, 5),
    [conversations]
  );
  const lastActivity = conversations[0]?.updated_at;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 md:gap-6">
      <AgentHero
        name="Mike"
        tagline="Handles first-line product questions across email and website chat, with a human manager always in reach."
        stats={[
          { label: "Auto-resolved", value: `${stats.auto_resolution_rate}%` },
          { label: "Avg. confidence", value: `${stats.avg_confidence}%` },
          { label: "Coverage", value: `${knowledge.length} ${knowledge.length === 1 ? "concept" : "concepts"}` },
        ]}
      />

      {!connected && (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-25 px-4 py-3 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300 sm:flex-row sm:items-center sm:justify-between">
          <span><strong>API unavailable.</strong> Start the API to load live conversations and metrics.</span>
          <code className="font-mono text-xs">uvicorn app.main:app --reload</code>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <StatCard label="Open conversations" value={String(stats.open_conversations)} icon={<ChatIcon className="size-5" />} />
        <StatCard label="Resolved today" value={String(stats.resolved_today)} icon={<CheckCircleIcon className="size-5" />} />
        <StatCard label="Needs your review" value={String(stats.needs_human)} icon={<UserCircleIcon className="size-5" />} />
        <StatCard label="Knowledge concepts" value={String(knowledge.length)} icon={<DocsIcon className="size-5" />} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)] md:gap-6">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800 md:px-6">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Recent conversations</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">What Mike is handling right now.</p>
            </div>
            <Link href="/inbox" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">View inbox</Link>
          </div>
          <div className="flex-1 divide-y divide-gray-100 dark:divide-gray-800">
            {!recent.length && (
              <p className="px-5 py-12 text-center text-sm text-gray-500 md:px-6">No conversations yet. They appear here once customers reach Mike over chat or email.</p>
            )}
            {recent.map((conversation) => (
              <Link key={conversation.id} href="/inbox" className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02] md:px-6">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {conversation.customer_name.split(" ").map((part) => part[0]).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{conversation.customer_name}</p>
                    <span className="text-gray-300 dark:text-gray-700">·</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      {conversation.channel === "email" ? <MailIcon className="size-3.5" /> : <ChatIcon className="size-3.5" />}
                      {conversation.channel}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">{conversation.subject}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <Badge size="sm" color={conversation.status === "needs_human" ? (conversation.priority === "high" ? "warning" : "info") : conversation.status === "resolved" ? "success" : conversation.status === "closed" ? "light" : "info"}>
                    {conversation.status === "needs_human" ? (conversation.priority === "high" ? "Needs review" : "Follow-up") : conversation.status === "resolved" ? "Resolved" : conversation.status === "closed" ? "Closed" : "Open"}
                  </Badge>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{Math.round((conversation.confidence || 0) * 100)}% confidence</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Agent health</h2>
              <Badge size="sm" color={connected ? "success" : "warning"}>{connected ? "Operational" : "Offline"}</Badge>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <AgentAvatar name="Mike" size="lg" showStatus />
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{connected ? "Ready for new work" : "Waiting for API"}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Claude harness · Nylas · PostgreSQL</p>
              </div>
            </div>
            <dl className="mt-5 space-y-3 border-t border-gray-100 pt-4 text-sm dark:border-gray-800">
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">API</dt><dd className="font-medium text-gray-800 dark:text-gray-200">{connected ? "Connected" : "Unavailable"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Knowledge index</dt><dd className="font-medium text-gray-800 dark:text-gray-200">{knowledge.length ? "Ready" : "Empty"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Last activity</dt><dd className="font-medium text-gray-800 dark:text-gray-200">{lastActivity ? relativeTime(lastActivity) : "No activity yet"}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Try Mike</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Test a customer question against the current role, guardrails, and knowledge.</p>
            <Link href="/chat" className="mt-4 block"><Button className="w-full">Open test conversation</Button></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
