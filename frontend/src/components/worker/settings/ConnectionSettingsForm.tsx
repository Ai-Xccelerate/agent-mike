"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { fieldClass, hintClass, labelClass } from "@/components/worker/settings/ui";
import {
  getJiraProjects,
  getKnowledgeIndexStatus,
  saveIntegrationSettings,
  startKnowledgeIndexSync,
  type KnowledgeIndexStatus,
  type JiraProject,
  type ConfluenceConnectionSettings,
  type IntegrationConnection,
  type JiraConnectionSettings,
} from "@/lib/worker-api";

type Connection = NonNullable<IntegrationConnection>;

/** Whether this connection has settings of its own (Jira, Confluence). */
export function hasConnectionSettings(connection: IntegrationConnection): connection is Connection {
  return Boolean(connection?.settings) && (connection?.system === "jira" || connection?.system === "confluence");
}

/** The one-line hint a connected card shows about its settings. */
export function connectionSettingsNote(connection: Connection): string | undefined {
  if (connection.system !== "jira") return undefined;
  const settings = connection.settings as JiraConnectionSettings;
  if (settings.projectKey && settings.workerChoosesRequestType) {
    return `Handoffs raise tickets in ${settings.projectKey}; the worker picks the request type.`;
  }
  const type = settings.requestTypeId ? settings.requestTypeName ?? "service request" : settings.issueType;
  return settings.projectKey && type
    ? `Handoffs raise tickets in ${settings.projectKey} (${type}).`
    : "Set a project to raise a ticket on every handoff.";
}

/**
 * The settings a connected Jira or Confluence has of its own, in a dialog
 * opened from the card's gear button. Nothing is saved until Save, so
 * Cancel always leaves things as they were.
 */
export default function ConnectionSettingsDialog({
  integrationType,
  connection,
  isOpen,
  onClose,
  onSaved,
}: {
  integrationType: string;
  connection: Connection;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (row: IntegrationConnection) => void;
}) {
  const title = connection.system === "jira" ? "Jira settings" : "Confluence settings";
  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel={title} className="w-full max-w-lg p-6 sm:p-7">
      {/* Mounted only while open, so every opening starts from the saved values. */}
      {isOpen &&
        (connection.system === "jira" ? (
          <JiraForm
            integrationType={integrationType}
            settings={connection.settings as JiraConnectionSettings}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : (
          <ConfluenceForm
            integrationType={integrationType}
            settings={connection.settings as ConfluenceConnectionSettings}
            onClose={onClose}
            onSaved={onSaved}
          />
        ))}
    </Modal>
  );
}

type FormProps<T> = {
  integrationType: string;
  settings: T;
  onClose: () => void;
  onSaved: (row: IntegrationConnection) => void;
};

function useSave(integrationType: string, onSaved: (row: IntegrationConnection) => void, onClose: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(settings: Partial<JiraConnectionSettings> | Partial<ConfluenceConnectionSettings>) {
    setSaving(true);
    setError("");
    try {
      onSaved(await saveIntegrationSettings(integrationType, settings));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, save };
}

function DialogHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="pr-8">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

function DialogFooter({ saving, error, onCancel }: { saving: boolean; error: string; onCancel: () => void }) {
  return (
    <>
      {error && <p className="mt-4 text-xs font-medium text-error-600 dark:text-error-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" type="submit" loading={saving} disabled={saving}>
          Save
        </Button>
      </div>
    </>
  );
}

function JiraForm({ integrationType, settings, onClose, onSaved }: FormProps<JiraConnectionSettings>) {
  const [projectKey, setProjectKey] = useState(settings.projectKey ?? "");
  const [issueType, setIssueType] = useState(settings.issueType ?? "");
  const [requestTypeId, setRequestTypeId] = useState(settings.requestTypeId ?? "");
  const [createTicketOnHandoff, setCreateTicketOnHandoff] = useState(settings.createTicketOnHandoff);
  const [workerChooses, setWorkerChooses] = useState(settings.workerChoosesRequestType);
  const [createCustomers, setCreateCustomers] = useState(Boolean(settings.createCustomers));
  // Null while loading; "failed" falls back to typing the values in.
  const [projects, setProjects] = useState<JiraProject[] | "failed" | null>(null);
  const { saving, error, save } = useSave(integrationType, onSaved, onClose);

  useEffect(() => {
    let cancelled = false;
    getJiraProjects(integrationType)
      .then(({ projects: list }) => !cancelled && setProjects(list))
      .catch(() => !cancelled && setProjects("failed"));
    return () => {
      cancelled = true;
    };
  }, [integrationType]);

  const listed = Array.isArray(projects) ? projects : null;
  const project = listed?.find((entry) => entry.key === projectKey) ?? null;
  const issueTypes = project?.issueTypes ?? [];
  const requestTypes = project?.requestTypes ?? [];
  // A service desk's handoffs go in as requests, so they show in its queues
  // and portal. The request type then decides the issue type.
  const asRequest = requestTypes.length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save({
          projectKey: projectKey.trim() || null,
          issueType: issueType.trim() || null,
          // Without the project list there's no way to change it, so keep what's saved.
          requestTypeId: listed ? (asRequest && !workerChooses && requestTypeId) || null : settings.requestTypeId,
          workerChoosesRequestType: listed ? asRequest && workerChooses : settings.workerChoosesRequestType,
          createTicketOnHandoff,
          createCustomers,
        });
      }}
    >
      <DialogHeader
        title="Jira settings"
        description="Where the worker raises a ticket when it hands a conversation to a person."
      />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label>
          <span className={labelClass}>Project</span>
          {listed ? (
            <select
              className={`mt-1.5 ${fieldClass}`}
              value={projectKey}
              onChange={(event) => {
                const next = listed.find((entry) => entry.key === event.target.value);
                setProjectKey(event.target.value);
                // Keep the issue and request types only if the new project has them too.
                if (!next?.issueTypes.includes(issueType)) setIssueType(next?.issueTypes[0] ?? "");
                if (!next?.requestTypes.some((type) => type.id === requestTypeId)) {
                  setRequestTypeId(next?.requestTypes[0]?.id ?? "");
                }
              }}
            >
              <option value="">Choose a project</option>
              {listed.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name} ({entry.key})
                </option>
              ))}
            </select>
          ) : (
            <input
              className={`mt-1.5 ${fieldClass}`}
              value={projectKey}
              placeholder={projects === null ? "Loading projects…" : "Project key"}
              disabled={projects === null}
              onChange={(event) => setProjectKey(event.target.value.toUpperCase())}
            />
          )}
        </label>
        {asRequest ? (
          <label>
            <span className={labelClass}>Request type</span>
            <select
              className={`mt-1.5 ${fieldClass}`}
              value={workerChooses ? "" : requestTypes.some((type) => type.id === requestTypeId) ? requestTypeId : ""}
              disabled={workerChooses}
              onChange={(event) => setRequestTypeId(event.target.value)}
            >
              <option value="">{workerChooses ? "Chosen per conversation" : "Choose a request type"}</option>
              {requestTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            <span className={labelClass}>Issue type</span>
            {listed ? (
              <select
                className={`mt-1.5 ${fieldClass}`}
                value={issueTypes.includes(issueType) ? issueType : ""}
                disabled={!project}
                onChange={(event) => setIssueType(event.target.value)}
              >
                <option value="">{project ? "Choose an issue type" : "Choose a project first"}</option>
                {issueTypes.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={`mt-1.5 ${fieldClass}`}
                value={issueType}
                placeholder={projects === null ? "Loading issue types…" : "Issue type"}
                disabled={projects === null}
                onChange={(event) => setIssueType(event.target.value)}
              />
            )}
          </label>
        )}
      </div>
      <p className={hintClass}>
        {projects === "failed"
          ? "Couldn't load your Jira projects, so type them in. They're checked with Jira when you save."
          : asRequest
            ? workerChooses
              ? "The worker picks the request type that fits each conversation, from this desk's own list, and collects the fields it needs."
              : "This is a service desk, so handoffs go in as requests and show in its queues."
            : "Only issue types that exist in the chosen project are listed."}
      </p>
      <div className="mt-5 space-y-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        {asRequest && (
          <SettingsToggleRow
            title="Let the worker choose the request type"
            description="It reads what each request type is for and what it needs. If its choice can't be used, the ticket fails in the Inbox instead of going in as the wrong type."
            checked={workerChooses}
            disabled={saving}
            onChange={() => setWorkerChooses((value) => !value)}
          />
        )}
        <SettingsToggleRow
          title="Raise a ticket on handoff"
          description="The ticket gets the conversation, and the customer is told its number. Customers only ever see their own tickets."
          checked={createTicketOnHandoff}
          disabled={saving}
          onChange={() => setCreateTicketOnHandoff((value) => !value)}
        />
        <SettingsToggleRow
          title="Create Jira customers"
          description="When a visitor who verified their email is not a Jira customer yet, create their account so the ticket is raised in their name. Only works when Customer identity is set to the emailed code, under Guardrails."
          checked={createCustomers}
          disabled={saving}
          onChange={() => setCreateCustomers((value) => !value)}
        />
      </div>
      <DialogFooter saving={saving} error={error} onCancel={onClose} />
    </form>
  );
}

function ConfluenceForm({ integrationType, settings, onClose, onSaved }: FormProps<ConfluenceConnectionSettings>) {
  const [spaceKeys, setSpaceKeys] = useState(settings.spaceKeys.length > 0 ? settings.spaceKeys : [""]);
  const [searchBeforeAnswering, setSearchBeforeAnswering] = useState(settings.searchBeforeAnswering);
  const [searchIndex, setSearchIndex] = useState(Boolean(settings.searchIndex));
  const { saving, error, save } = useSave(integrationType, onSaved, onClose);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save({ spaceKeys: spaceKeys.map((key) => key.trim()).filter(Boolean), searchBeforeAnswering, searchIndex });
      }}
    >
      <DialogHeader title="Confluence settings" description="Which pages the worker answers from." />
      <div className="mt-5">
        <span className={labelClass}>Space keys</span>
        {spaceKeys.map((key, index) => (
          <div key={index} className="mt-1.5 flex gap-2">
            <input
              className={fieldClass}
              value={key}
              placeholder={index === 0 ? "Leave empty for every space" : "e.g. PGFP"}
              aria-label={`Space key ${index + 1}`}
              onChange={(event) => setSpaceKeys((keys) => keys.map((k, i) => (i === index ? event.target.value : k)))}
            />
            {spaceKeys.length > 1 && (
              <button
                type="button"
                className="px-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                aria-label={`Remove space key ${index + 1}`}
                onClick={() => setSpaceKeys((keys) => keys.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="mt-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          onClick={() => setSpaceKeys((keys) => [...keys, ""])}
        >
          + Add another space
        </button>
      </div>
      <p className={hintClass}>The short key in each space&rsquo;s address, e.g. EAPX. Answers come from all of them.</p>
      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
        <SettingsToggleRow
          title="Search before every answer"
          description="The worker searches the pages' text for each question and answers from what it finds."
          checked={searchBeforeAnswering}
          disabled={saving}
          onChange={() => setSearchBeforeAnswering((value) => !value)}
        />
        <SettingsToggleRow
          title="Search a saved copy"
          description="Answers come from a copy of these pages kept in sections and updated every few minutes. It finds more and answers faster. If the copy is empty or fails, the worker searches Confluence directly."
          checked={searchIndex}
          disabled={saving || !searchBeforeAnswering}
          onChange={() => setSearchIndex((value) => !value)}
        />
        <KnowledgeIndexPanel />
      </div>
      <DialogFooter saving={saving} error={error} onCancel={onClose} />
    </form>
  );
}

function minutesAgo(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/** What the saved copy holds and when it last synced, with a button to sync now. */
function KnowledgeIndexPanel() {
  const [status, setStatus] = useState<KnowledgeIndexStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getKnowledgeIndexStatus()
        .then((next) => !cancelled && (setStatus(next), setFailed(false)))
        .catch(() => !cancelled && setFailed(true));
    void load();
    // While a sync runs, follow it.
    const timer = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function syncNow() {
    setStarting(true);
    try {
      await startKnowledgeIndexSync();
      setStatus((current) => (current ? { ...current, running: true } : current));
    } catch {
      setFailed(true);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
      {failed && !status ? (
        <p className={hintClass}>The saved copy&rsquo;s status could not be loaded.</p>
      ) : !status ? (
        <p className={hintClass}>Loading…</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-gray-700 dark:text-gray-300">
            {status.sections > 0
              ? `${status.pages} pages in ${status.sections} sections. Last synced ${status.running ? "now, syncing…" : minutesAgo(status.lastFinishedAt)}.`
              : status.running
                ? "Making the first copy…"
                : "No copy yet. Sync now to make one."}
            {status.lastError ? <span className="mt-1 block text-error-600 dark:text-error-400">Last sync failed: {status.lastError}</span> : null}
          </p>
          <button
            type="button"
            className="rounded-md border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            disabled={starting || status.running || !status.connected}
            onClick={() => void syncNow()}
          >
            {status.running ? "Syncing…" : "Sync now"}
          </button>
        </div>
      )}
    </div>
  );
}
