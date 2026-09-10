"use client";

import WorkerHero from "@/components/aix/WorkerHero";
import StatCard from "@/components/aix/StatCard";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ChatIcon, CheckCircleIcon, DocsIcon, MailIcon, UserCircleIcon } from "@/icons";
import { apiFetch, Conversation, KnowledgeDocument, WorkerProfile } from "@/lib/worker-api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function WorkerDashboard() {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeDocument[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<WorkerProfile>("/worker");
        if (cancelled) return;
        setProfile(data);
        setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
      try {
        const items = await apiFetch<Conversation[]>("/conversations");
        if (!cancelled) setConversations(items);
      } catch {
        /* keep empty */
      }
      try {
        const docs = await apiFetch<KnowledgeDocument[]>("/knowledge");
        if (!cancelled) setKnowledge(docs);
      } catch {
        /* keep empty */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recent = useMemo(
    () => conversations.filter((c) => c.status !== "resolved" && c.status !== "closed").slice(0, 5),
    [conversations],
  );
  const stats = useMemo(() => {
    const total = conversations.length;
    const resolved = conversations.filter((c) => c.status === "resolved").length;
    const needsHuman = conversations.filter((c) => c.status === "needs_human").length;
    const confidences = conversations.map((c) => c.confidence).filter((c): c is number => c != null);
    const avgConfidence = confidences.length
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
      : 0;
    return {
      open: total - resolved - conversations.filter((c) => c.status === "closed").length,
      resolved,
      needsHuman,
      autoResolutionRate: total ? Math.round((resolved / total) * 100) : 0,
      avgConfidence,
    };
  }, [conversations]);
  const lastActivity = conversations[0]?.updatedAt;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 md:gap-6">
      <WorkerHero
        displayName={profile?.displayName ?? "AI Worker"}
        avatarInitials={profile?.avatarInitials ?? "AW"}
        tagline={profile?.role ?? "Configure this worker's role under Settings."}
        stats={[
          { label: "Auto-resolved", value: `${stats.autoResolutionRate}%` },
          { label: "Avg. confidence", value: `${stats.avgConfidence}%` },
          {
            label: "Coverage",
            value: `${knowledge.length} ${knowledge.length === 1 ? "concept" : "concepts"}`,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <StatCard label="Open conversations" value={String(stats.open)} icon={<ChatIcon className="size-5" />} />
        <StatCard label="Resolved" value={String(stats.resolved)} icon={<CheckCircleIcon className="size-5" />} />
        <StatCard
          label="Needs your review"
          value={String(stats.needsHuman)}
          icon={<UserCircleIcon className="size-5" />}
        />
        <StatCard label="Knowledge concepts" value={String(knowledge.length)} icon={<DocsIcon className="size-5" />} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)] md:gap-6">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800 md:px-6">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Recent conversations</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                What {profile?.displayName ?? "this worker"} is handling right now.
              </p>
            </div>
            <Link href="/inbox" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              View inbox
            </Link>
          </div>
          <div className="flex-1 divide-y divide-gray-100 dark:divide-gray-800">
            {!recent.length && (
              <p className="px-5 py-12 text-center text-sm text-gray-500 md:px-6">
                No conversations yet. They appear here once a customer reaches out over chat or the website widget.
              </p>
            )}
            {recent.map((conversation) => (
              <Link
                key={conversation.id}
                href="/inbox"
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02] md:px-6"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {conversation.customerName
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                      {conversation.customerName}
                    </p>
                    <span className="text-gray-300 dark:text-gray-700">·</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      {conversation.channel === "email" ? (
                        <MailIcon className="size-3.5" />
                      ) : (
                        <ChatIcon className="size-3.5" />
                      )}
                      {conversation.channel}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">{conversation.subject}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <Badge
                    size="sm"
                    color={
                      conversation.status === "needs_human"
                        ? conversation.priority === "high"
                          ? "warning"
                          : "info"
                        : conversation.status === "resolved"
                          ? "success"
                          : conversation.status === "closed"
                            ? "light"
                            : "info"
                    }
                  >
                    {conversation.status === "needs_human"
                      ? conversation.priority === "high"
                        ? "Needs review"
                        : "Follow-up"
                      : conversation.status === "resolved"
                        ? "Resolved"
                        : conversation.status === "closed"
                          ? "Closed"
                          : "Open"}
                  </Badge>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {Math.round((conversation.confidence || 0) * 100)}% confidence
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Worker health</h2>
              <Badge size="sm" color={connected ? "success" : "warning"}>
                {connected ? "Operational" : "Offline"}
              </Badge>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {connected ? "Ready for new work" : "Waiting for API"}
              </span>
            </div>
            <dl className="mt-5 space-y-3 border-t border-gray-100 pt-4 text-sm dark:border-gray-800">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">API</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {connected ? "Connected" : "Unavailable"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Knowledge index</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{knowledge.length ? "Ready" : "Empty"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Last activity</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {lastActivity ? relativeTime(lastActivity) : "No activity yet"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Try it</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Test a customer question against the current role, guardrails, and knowledge.
            </p>
            <Link href="/chat" className="mt-4 block">
              <Button className="w-full">Open test conversation</Button>
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
