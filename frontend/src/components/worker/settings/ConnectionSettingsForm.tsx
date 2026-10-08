"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { fieldClass, hintClass, labelClass } from "@/components/worker/settings/ui";
import {
  getJiraProjects,
  saveIntegrationSettings,
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
          requestTypeId: listed ? (asRequest && requestTypeId) || null : settings.requestTypeId,
          createTicketOnHandoff,
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
              value={requestTypes.some((type) => type.id === requestTypeId) ? requestTypeId : ""}
              onChange={(event) => setRequestTypeId(event.target.value)}
            >
              <option value="">Choose a request type</option>
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
            ? "This is a service desk, so handoffs go in as requests and show in its queues."
            : "Only issue types that exist in the chosen project are listed."}
      </p>
      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
        <SettingsToggleRow
          title="Raise a ticket on handoff"
          description="The ticket gets the conversation, and the customer is told its number. Customers only ever see their own tickets."
          checked={createTicketOnHandoff}
          disabled={saving}
          onChange={() => setCreateTicketOnHandoff((value) => !value)}
        />
      </div>
      <DialogFooter saving={saving} error={error} onCancel={onClose} />
    </form>
  );
}

function ConfluenceForm({ integrationType, settings, onClose, onSaved }: FormProps<ConfluenceConnectionSettings>) {
  const [spaceKey, setSpaceKey] = useState(settings.spaceKey ?? "");
  const [searchBeforeAnswering, setSearchBeforeAnswering] = useState(settings.searchBeforeAnswering);
  const { saving, error, save } = useSave(integrationType, onSaved, onClose);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save({ spaceKey: spaceKey.trim() || null, searchBeforeAnswering });
      }}
    >
      <DialogHeader title="Confluence settings" description="Which pages the worker answers from." />
      <label className="mt-5 block">
        <span className={labelClass}>Space key</span>
        <input
          className={`mt-1.5 ${fieldClass}`}
          value={spaceKey}
          placeholder="Leave empty for every space"
          onChange={(event) => setSpaceKey(event.target.value)}
        />
      </label>
      <p className={hintClass}>The short key in the space&rsquo;s address, e.g. SK.</p>
      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
        <SettingsToggleRow
          title="Search before every answer"
          description="The worker searches the pages' text for each question and answers from what it finds."
          checked={searchBeforeAnswering}
          disabled={saving}
          onChange={() => setSearchBeforeAnswering((value) => !value)}
        />
      </div>
      <DialogFooter saving={saving} error={error} onCancel={onClose} />
    </form>
  );
}
