"use client";

import { useState } from "react";
import Button from "@/components/ui/button/Button";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { fieldClass, hintClass, labelClass, panelClass } from "@/components/worker/settings/ui";
import {
  saveIntegrationSettings,
  type ConfluenceConnectionSettings,
  type IntegrationConnection,
  type JiraConnectionSettings,
} from "@/lib/worker-api";

/**
 * The settings a connected Jira or Confluence has of its own: where handoff
 * tickets go, and which space answers come from. Shown under the category's
 * cards once the connection is active.
 */
export default function ConnectionSettingsForm({
  integrationType,
  connection,
  onSaved,
}: {
  integrationType: string;
  connection: NonNullable<IntegrationConnection>;
  onSaved: (row: IntegrationConnection) => void;
}) {
  // Keyed on the saved values so the fields reset to them after a save,
  // without copying props into state in an effect.
  if (connection.system === "jira") {
    const settings = connection.settings as JiraConnectionSettings;
    return (
      <JiraSettingsForm
        key={`${settings.projectKey}|${settings.issueType}`}
        integrationType={integrationType}
        settings={settings}
        onSaved={onSaved}
      />
    );
  }
  if (connection.system === "confluence") {
    const settings = connection.settings as ConfluenceConnectionSettings;
    return (
      <ConfluenceSettingsForm
        key={settings.spaceKey ?? ""}
        integrationType={integrationType}
        settings={settings}
        onSaved={onSaved}
      />
    );
  }
  return null;
}

function useSave(integrationType: string, onSaved: (row: IntegrationConnection) => void) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(settings: Partial<JiraConnectionSettings> | Partial<ConfluenceConnectionSettings>) {
    setSaving(true);
    setMessage(null);
    try {
      onSaved(await saveIntegrationSettings(integrationType, settings));
      setMessage({ ok: true, text: "Saved." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  return { saving, message, save };
}

const panel = `mt-4 ${panelClass}`;

function SaveRow({ saving, message, onSave }: { saving: boolean; message: { ok: boolean; text: string } | null; onSave: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <Button size="sm" onClick={onSave} loading={saving} disabled={saving}>
        Save
      </Button>
      {message && (
        <p
          className={`text-xs font-medium ${
            message.ok ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function JiraSettingsForm({
  integrationType,
  settings,
  onSaved,
}: {
  integrationType: string;
  settings: JiraConnectionSettings;
  onSaved: (row: IntegrationConnection) => void;
}) {
  const [projectKey, setProjectKey] = useState(settings.projectKey ?? "");
  const [issueType, setIssueType] = useState(settings.issueType ?? "");
  const { saving, message, save } = useSave(integrationType, onSaved);

  const ready = Boolean(settings.projectKey && settings.issueType);

  return (
    <div className={panel}>
      <SettingsToggleRow
        title="Raise a ticket when the worker hands over"
        description={
          ready
            ? `Every handoff creates a ${settings.issueType} in ${settings.projectKey} with the conversation, and the customer is told its number.`
            : "Set the project and issue type below to turn this on."
        }
        checked={settings.createTicketOnHandoff}
        disabled={saving}
        onChange={() => void save({ createTicketOnHandoff: !settings.createTicketOnHandoff })}
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className={labelClass}>Project key</span>
          <input
            className={`mt-1 ${fieldClass}`}
            value={projectKey}
            placeholder="SUP"
            onChange={(event) => setProjectKey(event.target.value.toUpperCase())}
          />
        </label>
        <label>
          <span className={labelClass}>Issue type</span>
          <input
            className={`mt-1 ${fieldClass}`}
            value={issueType}
            placeholder="Task"
            onChange={(event) => setIssueType(event.target.value)}
          />
        </label>
      </div>
      <p className={hintClass}>
        Use a type that exists in that project, exactly as Jira names it. The customer only ever sees tickets raised for
        their own conversations.
      </p>
      <SaveRow
        saving={saving}
        message={message}
        onSave={() => void save({ projectKey: projectKey.trim() || null, issueType: issueType.trim() || null })}
      />
    </div>
  );
}

function ConfluenceSettingsForm({
  integrationType,
  settings,
  onSaved,
}: {
  integrationType: string;
  settings: ConfluenceConnectionSettings;
  onSaved: (row: IntegrationConnection) => void;
}) {
  const [spaceKey, setSpaceKey] = useState(settings.spaceKey ?? "");
  const { saving, message, save } = useSave(integrationType, onSaved);

  return (
    <div className={panel}>
      <SettingsToggleRow
        title="Search before every answer"
        description="The worker searches the space's page text for each question and answers from what it finds."
        checked={settings.searchBeforeAnswering}
        disabled={saving}
        onChange={() => void save({ searchBeforeAnswering: !settings.searchBeforeAnswering })}
      />
      <label className="mt-3 block sm:max-w-xs">
        <span className={labelClass}>Space key</span>
        <input
          className={`mt-1 ${fieldClass}`}
          value={spaceKey}
          placeholder="Every space"
          onChange={(event) => setSpaceKey(event.target.value)}
        />
      </label>
      <SaveRow saving={saving} message={message} onSave={() => void save({ spaceKey: spaceKey.trim() || null })} />
    </div>
  );
}
