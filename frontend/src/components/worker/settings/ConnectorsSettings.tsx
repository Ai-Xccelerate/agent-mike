"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { IntegrationStatusPill } from "@/components/worker/settings/IntegrationCard";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsSection from "@/components/worker/settings/SettingsSection";
import SettingsToggle from "@/components/worker/settings/SettingsToggle";
import { dividerClass, fieldClass, hintClass, labelClass, panelClass } from "@/components/worker/settings/ui";
import { CheckLineIcon, ChevronDownIcon, CloseLineIcon, LinkIcon, PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import {
  createConnector,
  decideApproval,
  deleteConnector,
  getConnectors,
  refreshConnector,
  updateConnector,
  WorkerApiError,
  type Connector,
  type ConnectorAuthType,
  type ConnectorPendingApproval,
  type ConnectorToolPermission,
} from "@/lib/worker-api";

/**
 * Settings > Connectors.
 *
 * Remote MCP servers an owner or admin plugs in, so the worker can use the
 * organization's own tools without us building an integration for each one.
 * Three decisions live here, in the order a manager makes them:
 *
 *   Add      the server's URL and how to sign in. The API connects before it
 *            saves, so a connector on this list has already answered once.
 *   Allow    per tool: always allow, needs approval, or off. Read-only tools
 *            start on always allow; anything that can change data starts on
 *            needs approval, and a tool the server adds later does too.
 *   Approve  calls that were set to "needs approval" wait at the bottom of
 *            this page until someone approves or rejects them.
 *
 * Every action saves immediately, like Email domains. There is no staged
 * Save: a permission is a decision, not a draft.
 */

type Phase = "loading" | "ready" | "failed";

const PERMISSION_OPTIONS: { value: ConnectorToolPermission; label: string; hint: string }[] = [
  { value: "auto", label: "Always allow", hint: "Runs without asking." },
  { value: "approval", label: "Needs approval", hint: "Waits for an owner or admin." },
  { value: "off", label: "Off", hint: "The worker can't use it." },
];

const AUTH_OPTIONS: { value: ConnectorAuthType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer token" },
  { value: "header", label: "API key header" },
];

function formatWhen(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * A row of mutually exclusive choices. Neutral when selected (white chip on a
 * grey track) so the page keeps its one orange moment for the primary action.
 */
function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-800 dark:bg-white/[0.04]"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(option.value)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "bg-white text-gray-800 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-white/90 dark:ring-gray-700"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Add / edit ──────────────────────────────────────────────────────────────

type FormState = { name: string; url: string; authType: ConnectorAuthType; headerName: string; secret: string };
const EMPTY_FORM: FormState = { name: "", url: "", authType: "none", headerName: "", secret: "" };

function initialForm(editing: Connector | null): FormState {
  if (!editing) return EMPTY_FORM;
  return {
    name: editing.name,
    url: editing.url,
    authType: editing.authType,
    headerName: editing.authHeaderName ?? "",
    secret: "",
  };
}

function ConnectorFormModal({
  editing,
  isOpen,
  onClose,
  onSaved,
}: {
  editing: Connector | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (connector: Connector, created: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      ariaLabel={editing ? "Edit connector" : "Add connector"}
      className="m-4 w-full max-w-xl overflow-hidden rounded-2xl bg-white p-0 dark:bg-gray-900"
    >
      {/* Mounted per opening, so every open starts from the connector as saved. */}
      {isOpen && (
        <ConnectorForm
          key={editing?.id ?? "new"}
          editing={editing}
          saving={saving}
          setSaving={setSaving}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

function ConnectorForm({
  editing,
  saving,
  setSaving,
  onClose,
  onSaved,
}: {
  editing: Connector | null;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onClose: () => void;
  onSaved: (connector: Connector, created: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(editing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const savedSecretApplies = Boolean(editing?.hasSecret && editing.authType === form.authType);
  const authChanged =
    editing !== null &&
    (form.authType !== editing.authType ||
      (form.authType === "header" && form.headerName.trim() !== (editing.authHeaderName ?? "")) ||
      form.secret.trim() !== "");

  async function submit() {
    setSaving(true);
    setErrors({});
    setFormError("");
    const auth = {
      authType: form.authType,
      headerName: form.authType === "header" ? form.headerName.trim() : undefined,
      secret: form.authType === "none" ? undefined : form.secret.trim() || undefined,
    };
    try {
      if (editing) {
        const updated = await updateConnector(editing.id, {
          ...(form.name.trim() !== editing.name ? { name: form.name.trim() } : {}),
          ...(authChanged ? { auth } : {}),
        });
        onSaved(updated, false);
      } else {
        const created = await createConnector({ name: form.name.trim(), url: form.url.trim(), ...auth });
        onSaved(created, true);
      }
    } catch (error) {
      if (error instanceof WorkerApiError) {
        setErrors(error.errors ?? {});
        if (!error.errors || Object.keys(error.errors).length === 0) setFormError(error.message);
      } else {
        setFormError("Could not reach the API. Check that it is running.");
      }
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? <span className="mt-1.5 block text-xs font-medium text-error-600 dark:text-error-400">{errors[key]}</span> : null;

  const canSubmit =
    form.name.trim() &&
    form.url.trim() &&
    (form.authType === "none" || form.secret.trim() || savedSecretApplies) &&
    (form.authType !== "header" || form.headerName.trim());

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !saving) void submit();
      }}
      className="flex max-h-[85vh] flex-col"
    >
      <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-16 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {editing ? "Edit connector" : "Add connector"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {editing
            ? "Changing how it signs in reconnects to check the new details first."
            : "Connect a remote MCP server. We check that it answers before saving it."}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <label className={labelClass}>
          Name
          <input
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Acme tickets"
            maxLength={60}
            autoFocus
            className={`mt-2 ${fieldClass}`}
          />
          <span className={hintClass}>Shown to you and to the worker.</span>
          {fieldError("name")}
        </label>

        <label className={labelClass}>
          Server URL
          <input
            value={form.url}
            onChange={(event) => set("url", event.target.value)}
            placeholder="https://mcp.example.com/mcp"
            disabled={editing !== null}
            inputMode="url"
            spellCheck={false}
            className={`mt-2 font-mono ${fieldClass}`}
          />
          <span className={hintClass}>
            {editing ? "To use a different URL, add a new connector." : "Remote servers only, over https. Often ends in /mcp or /sse."}
          </span>
          {fieldError("url")}
        </label>

        <div>
          <p className={labelClass}>Authentication</p>
          <div className="mt-2">
            <SegmentedControl
              label="Authentication"
              value={form.authType}
              options={AUTH_OPTIONS}
              onChange={(value) => set("authType", value)}
            />
          </div>
          {fieldError("authType")}
        </div>

        {form.authType === "header" && (
          <label className={labelClass}>
            Header name
            <input
              value={form.headerName}
              onChange={(event) => set("headerName", event.target.value)}
              placeholder="X-API-Key"
              spellCheck={false}
              className={`mt-2 font-mono ${fieldClass}`}
            />
            {fieldError("headerName")}
          </label>
        )}

        {form.authType !== "none" && (
          <label className={labelClass}>
            {form.authType === "bearer" ? "Token" : "Key"}
            <input
              type="password"
              value={form.secret}
              onChange={(event) => set("secret", event.target.value)}
              placeholder={savedSecretApplies ? "Saved. Leave blank to keep it." : ""}
              autoComplete="off"
              spellCheck={false}
              className={`mt-2 font-mono ${fieldClass}`}
            />
            <span className={hintClass}>Stored encrypted. Nobody can read it back, including you.</span>
            {fieldError("secret")}
          </label>
        )}

        {formError && <p className="text-xs font-medium leading-5 text-error-600 dark:text-error-400">{formError}</p>}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
        <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" type="submit" loading={saving} disabled={!canSubmit}>
          {saving ? "Connecting…" : editing ? "Save changes" : "Add connector"}
        </Button>
      </div>
    </form>
  );
}

// ── One connector ───────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  canManage,
  onChange,
  onEdit,
  onRemove,
}: {
  connector: Connector;
  canManage: boolean;
  onChange: (connector: Connector, notice?: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(key: string, action: () => Promise<Connector>, notice?: string) {
    setBusy(key);
    setError("");
    try {
      onChange(await action(), notice);
    } catch (caught) {
      setError(caught instanceof WorkerApiError ? caught.message : "Could not save. Check that the API is running.");
    } finally {
      setBusy(null);
    }
  }

  const status = !connector.enabled ? "disconnected" : connector.status === "failed" ? "failed" : "connected";
  const counts = connector.tools.reduce(
    (acc, tool) => ({ ...acc, [tool.permission]: acc[tool.permission] + 1 }),
    { auto: 0, approval: 0, off: 0 } as Record<ConnectorToolPermission, number>,
  );
  const allSame = PERMISSION_OPTIONS.find((option) => counts[option.value] === connector.tools.length)?.value ?? null;
  const authLabel = AUTH_OPTIONS.find((option) => option.value === connector.authType)?.label ?? "None";

  return (
    <div className={`bg-white dark:bg-white/[0.03] ${panelClass}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400 [&>svg]:size-5">
          <LinkIcon />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{connector.name}</p>
            {status === "disconnected" ? (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
                Off
              </span>
            ) : (
              <IntegrationStatusPill status={status} />
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400">{connector.url}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {connector.tools.length} {connector.tools.length === 1 ? "tool" : "tools"}: {counts.auto} always allowed,{" "}
            {counts.approval} need approval, {counts.off} off. Sign-in: {authLabel.toLowerCase()}.
          </p>
          {connector.status === "failed" && connector.lastError && (
            <p className="mt-1 text-xs font-medium leading-5 text-error-600 dark:text-error-400">{connector.lastError}</p>
          )}
        </div>
        <SettingsToggle
          checked={connector.enabled}
          disabled={!canManage || busy !== null}
          label={connector.name}
          onChange={() =>
            run(
              "enabled",
              () => updateConnector(connector.id, { enabled: !connector.enabled }),
              connector.enabled ? `${connector.name} is off. The worker can't use its tools.` : `${connector.name} is on.`,
            )
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen((value) => !value)}
          endIcon={<ChevronDownIcon className={`size-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />}
        >
          {open ? "Hide tools" : "Tools and permissions"}
        </Button>
        {canManage && (
          <>
            <Button
              size="sm"
              variant="outline"
              loading={busy === "refresh"}
              disabled={busy !== null}
              onClick={() => run("refresh", () => refreshConnector(connector.id), `Checked ${connector.name} for new tools.`)}
            >
              Refresh tools
            </Button>
            <Button size="sm" variant="outline" startIcon={<PencilIcon className="size-4" />} disabled={busy !== null} onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="outline" startIcon={<TrashBinIcon className="size-4" />} disabled={busy !== null} onClick={onRemove}>
              Remove
            </Button>
          </>
        )}
        {connector.lastSyncedAt && (
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">Tools checked {formatWhen(connector.lastSyncedAt)}</span>
        )}
      </div>

      {error && <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">{error}</p>}

      {open && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
          {connector.tools.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">This server lists no tools. Refresh after it adds some.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Read-only tools start on always allow. Anything else starts on needs approval.
                </p>
                {canManage && connector.tools.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Set all</span>
                    <SegmentedControl
                      label={`Set every ${connector.name} tool`}
                      value={allSame}
                      options={PERMISSION_OPTIONS}
                      disabled={busy !== null}
                      onChange={(value) =>
                        run("all", () =>
                          updateConnector(connector.id, {
                            toolPermissions: Object.fromEntries(connector.tools.map((tool) => [tool.name, value])),
                          }),
                        )
                      }
                    />
                  </div>
                )}
              </div>
              <div className={dividerClass}>
                {connector.tools.map((tool) => (
                  <div key={tool.name} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-all font-mono text-xs font-semibold text-gray-800 dark:text-white/90">{tool.name}</p>
                        {tool.readOnly && (
                          <Badge size="sm" color="light">
                            Read-only
                          </Badge>
                        )}
                        {tool.destructive && (
                          <Badge size="sm" color="warning">
                            Can delete
                          </Badge>
                        )}
                      </div>
                      {tool.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{tool.description}</p>
                      )}
                    </div>
                    <SegmentedControl
                      label={`Permission for ${tool.name}`}
                      value={tool.permission}
                      options={PERMISSION_OPTIONS}
                      disabled={!canManage || busy !== null}
                      onChange={(value) =>
                        run(`tool:${tool.name}`, () => updateConnector(connector.id, { toolPermissions: { [tool.name]: value } }))
                      }
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Waiting for approval ────────────────────────────────────────────────────

function ApprovalRow({
  approval,
  canManage,
  onDecided,
}: {
  approval: ConnectorPendingApproval;
  canManage: boolean;
  onDecided: (notice: string, error: boolean) => void;
}) {
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const input = JSON.stringify(approval.input, null, 2);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    try {
      const result = await decideApproval(approval.id, decision);
      if (decision === "rejected") onDecided(`Rejected. ${approval.toolName} did not run.`, false);
      else if (result.applied?.ok) onDecided(`Approved. ${approval.toolName} ran: ${result.applied.output.slice(0, 160)}`, false);
      else onDecided(`Approved, but it did not run: ${result.applied?.output ?? "unknown error"}`, true);
    } catch (caught) {
      onDecided(caught instanceof WorkerApiError ? caught.message : "Could not save that decision.", true);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
          {approval.connectorName}: <span className="font-mono text-xs">{approval.toolName}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Asked {formatWhen(approval.createdAt)}</p>
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
          {input === "{}" ? "(no inputs)" : input}
        </pre>
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            startIcon={<CloseLineIcon className="size-3.5" />}
            loading={busy === "rejected"}
            disabled={busy !== null}
            onClick={() => void decide("rejected")}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            startIcon={<CheckLineIcon className="size-4" />}
            loading={busy === "approved"}
            disabled={busy !== null}
            onClick={() => void decide("approved")}
          >
            Approve and run
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ConnectorsSettings() {
  // Mike has no per-user role in the browser (team and roles live in AIX Core).
  // The API refuses connector changes from non-admins, which shows as an error here.
  const canManage = true;
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [pending, setPending] = useState<ConnectorPendingApproval[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Connector | null>(null);
  const [removing, setRemoving] = useState<Connector | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(
    () =>
      getConnectors()
        .then((data) => {
          setConnectors(data.connectors);
          setPending(data.pendingApprovals);
          setPhase("ready");
        })
        .catch(() => setPhase("failed")),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function say(message: string, error = false) {
    setNotice(message);
    setNoticeError(error);
  }

  function replace(updated: Connector, message?: string) {
    setConnectors((current) => current.map((connector) => (connector.id === updated.id ? updated : connector)));
    // Switching things off retires queued calls server-side, so re-read them.
    void load();
    if (message) say(message);
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await deleteConnector(removing.id);
      say(`${removing.name} removed. The worker can no longer use its tools.`);
      setRemoving(null);
      await load();
    } catch (caught) {
      say(caught instanceof WorkerApiError ? caught.message : "Could not remove it. Check that the API is running.", true);
    } finally {
      setRemoveBusy(false);
    }
  }

  const addButton = canManage ? (
    <Button
      size="sm"
      startIcon={<PlusIcon className="size-4" />}
      onClick={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      Add connector
    </Button>
  ) : null;

  return (
    <>
      <SettingsPageHeader
        title="Connectors"
        description="Connect this worker to your own tools through remote MCP servers. You decide which tools run on their own and which wait for approval."
      />

      {notice && (
        <p
          role="status"
          className={`text-sm font-medium ${noticeError ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-400"}`}
        >
          {notice}
        </p>
      )}

      <SettingsSection
        title="Custom connectors"
        description="Each one is a remote MCP server. Only owners and admins can add or change them. Changes save as you make them."
        action={addButton}
        aixId="AIX-167.1"
        interactive={false}
      >
        {phase === "loading" && <p className="text-sm text-gray-500 dark:text-gray-400">Loading connectors…</p>}
        {phase === "failed" && (
          <p className="text-sm text-error-600 dark:text-error-400">Could not load connectors. Check that the API is running.</p>
        )}
        {phase === "ready" && connectors.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
            <span className="flex size-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400 [&>svg]:size-5">
              <LinkIcon />
            </span>
            <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
              No connectors yet. Add a remote MCP server to give this worker tools from your own systems.
            </p>
          </div>
        )}
        {phase === "ready" && connectors.length > 0 && (
          <div className="space-y-4">
            {connectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                canManage={canManage}
                onChange={replace}
                onEdit={() => {
                  setEditing(connector);
                  setFormOpen(true);
                }}
                onRemove={() => setRemoving(connector)}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Waiting for approval"
        description="Calls to tools set to needs approval. Nothing runs until an owner or admin approves it here."
        aixId="AIX-167.2"
        interactive={false}
      >
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nothing is waiting.</p>
        ) : (
          <div className={dividerClass}>
            {pending.map((approval) => (
              <ApprovalRow
                key={approval.id}
                approval={approval}
                canManage={canManage}
                onDecided={(message, error) => {
                  say(message, error);
                  void load();
                }}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <ConnectorFormModal
        isOpen={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(connector, created) => {
          setFormOpen(false);
          if (created) {
            setConnectors((current) => [...current, connector]);
            say(`${connector.name} connected with ${connector.tools.length} ${connector.tools.length === 1 ? "tool" : "tools"}. Review their permissions below.`);
          } else {
            replace(connector, `${connector.name} saved.`);
          }
        }}
      />

      <Modal
        isOpen={removing !== null}
        onClose={() => !removeBusy && setRemoving(null)}
        ariaLabel="Remove connector"
        className="m-4 w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900"
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Remove {removing?.name}?</h2>
        <p className="mt-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">
          The worker loses its tools straight away, and any calls waiting for approval are cancelled. You can add it again later.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={() => setRemoving(null)} disabled={removeBusy}>
            Cancel
          </Button>
          <Button size="sm" loading={removeBusy} onClick={() => void confirmRemove()}>
            Remove connector
          </Button>
        </div>
      </Modal>
    </>
  );
}
