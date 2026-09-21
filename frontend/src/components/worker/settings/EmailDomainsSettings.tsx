"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, sectionHintClass, sectionTitleClass } from "@/components/worker/settings/ui";
import { CheckCircleIcon, CheckLineIcon, CloseIcon, PlusIcon, TimeIcon, TrashBinIcon } from "@/icons";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import type {
  EmailDomain,
  EmailDomainDecision,
  EmailDomainList,
  EmailDomainStatus,
} from "@/lib/worker-api";

/**
 * Settings > Email domains.
 *
 * The allow-list that decides who outside the organization this worker may
 * share activity with. It reads as an approval queue rather than a settings
 * form because that is what it is: a domain arrives as a request — added here
 * by a manager, or raised by the worker mid-conversation — and someone has to
 * say yes before anything is shared.
 *
 * Three groups, each answering a different question, and each rendered even
 * when empty so the screen never hides a state it can be in:
 *
 *   Pending  — waiting on a person. Nothing is allowed yet.
 *   Approved — the worker may share with these.
 *   Revoked  — it was allowed and is not now. Kept, so the record survives.
 *
 * Every action writes immediately. There is no staged Save here: an approval
 * is a decision, not a draft, and a half-saved allow-list is the one state
 * this screen must never be in.
 */
type Phase = "loading" | "ready" | "failed";

const EMPTY_COUNTS: Record<EmailDomainStatus, number> = { pending: 0, approved: 0, revoked: 0 };

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function EmailDomainsSettings() {
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [counts, setCounts] = useState<Record<EmailDomainStatus, number>>(EMPTY_COUNTS);
  const [phase, setPhase] = useState<Phase>("loading");

  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  const load = useCallback(
    () =>
      apiFetch<EmailDomainList>("/email-domains")
        .then((data) => {
          setDomains(data.domains);
          setCounts({ ...EMPTY_COUNTS, ...data.counts });
          setPhase("ready");
        })
        .catch(() => setPhase("failed")),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!domain.trim()) return;
    setAdding(true);
    setAddError("");
    setNotice("");
    try {
      await apiFetch<EmailDomain>("/email-domains", {
        method: "POST",
        body: JSON.stringify({ domain, reason: reason.trim() || null }),
      });
      setDomain("");
      setReason("");
      await load();
      setNoticeError(false);
      setNotice("Added. It is waiting for approval below.");
    } catch (error) {
      setAddError(
        error instanceof WorkerApiError
          ? (error.errors?.domain ?? error.message)
          : "Could not add. Check that the API is running.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function decide(row: EmailDomain, decision: EmailDomainDecision) {
    setBusyId(row.id);
    setNotice("");
    try {
      await apiFetch<EmailDomain>(`/email-domains/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      await load();
      setNoticeError(false);
      setNotice(
        decision === "approve"
          ? `${row.domain} approved. The worker can share with it now.`
          : `${row.domain} revoked. The worker can no longer share with it.`,
      );
    } catch {
      setNoticeError(true);
      setNotice("Could not save that decision. Check that the API is running.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: EmailDomain) {
    setBusyId(row.id);
    setNotice("");
    try {
      await apiFetch(`/email-domains/${row.id}`, { method: "DELETE" });
      await load();
      setNoticeError(false);
      setNotice(`${row.domain} removed.`);
    } catch {
      setNoticeError(true);
      setNotice("Could not remove. Check that the API is running.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = domains.filter((row) => row.status === "pending");
  const approved = domains.filter((row) => row.status === "approved");
  const revoked = domains.filter((row) => row.status === "revoked");

  return (
    <>
      <SettingsPageHeader
        title="Email domains"
        description="Who outside this organization the worker may share activity with. Approve a domain and the worker can reach addresses on it; anything not approved here is refused."
      />

      {phase === "failed" ? (
        <section className={cardClass}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Could not load email domains. Check that the API is running.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setPhase("loading");
              void load();
            }}
          >
            Try again
          </Button>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-aix-id="AIX-166.1">
            <StatTile
              label="Pending"
              value={counts.pending}
              tone="warning"
              icon={<TimeIcon className="size-4" />}
            />
            <StatTile
              label="Approved"
              value={counts.approved}
              tone="success"
              icon={<CheckCircleIcon className="size-4" />}
            />
            <StatTile
              label="Revoked"
              value={counts.revoked}
              tone="muted"
              icon={<CloseIcon className="size-4" />}
            />
          </div>

          {notice && (
            <p
              className={`mt-5 text-sm font-medium ${
                noticeError
                  ? "text-error-600 dark:text-error-400"
                  : "text-success-600 dark:text-success-400"
              }`}
            >
              {notice}
            </p>
          )}

          <section className={`${cardClass} mt-5 md:mt-6`} data-aix-id="AIX-166.2">
            <h2 className={sectionTitleClass}>Add a domain</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Goes in as pending. Adding it allows nothing on its own. It still has to be approved
              below before the worker can share anything with it.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={domain}
                onChange={(event) => {
                  setDomain(event.target.value);
                  setAddError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !adding) void add();
                }}
                placeholder="acmecorp.com"
                aria-label="Domain"
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 font-mono text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 sm:max-w-xs"
              />
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !adding) void add();
                }}
                placeholder="Why the worker needs it (optional)"
                aria-label="Reason"
                className="h-11 w-full min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
              />
              <Button
                size="sm"
                className="shrink-0"
                loading={adding}
                disabled={!domain.trim()}
                startIcon={<PlusIcon className="size-4" />}
                onClick={() => void add()}
              >
                Add
              </Button>
            </div>

            {addError && (
              <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">
                {addError}
              </p>
            )}
          </section>

          <Group
            title="Pending approval"
            description="Waiting on a decision. The worker cannot use these yet."
            empty="Nothing waiting. Domains you add, and any the worker asks for during a conversation, show up here."
            rows={pending}
            loading={phase === "loading"}
            aixId="AIX-166.3"
          >
            {(row) => (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  loading={busyId === row.id}
                  startIcon={<CheckLineIcon className="size-4" />}
                  onClick={() => void decide(row, "approve")}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id}
                  onClick={() => void decide(row, "revoke")}
                >
                  Decline
                </Button>
                <button
                  onClick={() => void remove(row)}
                  disabled={busyId === row.id}
                  aria-label={`Remove ${row.domain}`}
                  className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-error-50 hover:text-error-600 disabled:opacity-50 dark:hover:bg-error-500/10"
                >
                  <TrashBinIcon className="size-4" />
                </button>
              </div>
            )}
          </Group>

          <Group
            title="Approved"
            description="The worker may share activity with addresses on these domains."
            empty="No domains approved yet. The worker shares with nobody outside this organization."
            rows={approved}
            loading={phase === "loading"}
            aixId="AIX-166.4"
          >
            {(row) => (
              <Button
                size="sm"
                variant="outline"
                loading={busyId === row.id}
                startIcon={<CloseIcon className="size-4" />}
                onClick={() => void decide(row, "revoke")}
              >
                Revoke access
              </Button>
            )}
          </Group>

          <Group
            title="Revoked"
            description="The worker cannot share with these. Re-approve to put one back."
            empty="Nothing revoked."
            rows={revoked}
            loading={phase === "loading"}
            aixId="AIX-166.5"
          >
            {(row) => (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  loading={busyId === row.id}
                  startIcon={<CheckLineIcon className="size-4" />}
                  onClick={() => void decide(row, "approve")}
                >
                  Re-approve
                </Button>
                <button
                  onClick={() => void remove(row)}
                  disabled={busyId === row.id}
                  aria-label={`Remove ${row.domain}`}
                  className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-error-50 hover:text-error-600 disabled:opacity-50 dark:hover:bg-error-500/10"
                >
                  <TrashBinIcon className="size-4" />
                </button>
              </div>
            )}
          </Group>
        </>
      )}
    </>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "warning" | "success" | "muted";
  icon: React.ReactNode;
}) {
  const toneClass = {
    warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400",
    success: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400",
    muted: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
  }[tone];

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
          {value}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function Group({
  title,
  description,
  empty,
  rows,
  loading,
  aixId,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  rows: EmailDomain[];
  loading: boolean;
  aixId: string;
  children: (row: EmailDomain) => React.ReactNode;
}) {
  return (
    <section className={`${cardClass} mt-5 md:mt-6`} data-aix-id={aixId}>
      <h2 className={sectionTitleClass}>{title}</h2>
      <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>

      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1].map((row) => (
            <div
              key={row}
              className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800/70"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-6 py-8 text-center text-sm leading-6 text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {empty}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-gray-800 dark:text-white/90">
                    {row.domain}
                  </p>
                  {row.requestedBy === "agent" && (
                    <Badge size="sm" color="light">
                      Requested by the worker
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {formatDate(row.decidedAt ?? row.createdAt)}
                </span>
              </div>

              {row.reason && (
                <p className={sectionHintClass}>
                  {row.reason}
                </p>
              )}

              <div className="mt-3">{children(row)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
