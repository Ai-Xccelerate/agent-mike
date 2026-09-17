"use client";

import { useEffect, useState } from "react";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import Markdown from "@/components/worker/Markdown";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SkillRepositoryCard from "@/components/worker/settings/SkillRepositoryCard";
import { cardClass, counterClass } from "@/components/worker/settings/ui";
import { BoltIcon, PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import {
  createCustomSkill,
  deleteCustomSkill,
  getSkillDetail,
  getSkillsCatalog,
  updateCustomSkill,
  type CustomSkillInput,
  type SkillCatalogEntry,
} from "@/lib/worker-api";

// Mirrors the backend's own VERIFY_CUSTOMER_SKILL_ID
// (lib/tools-integrations/skills-catalog.ts) — the id is stable catalog
// content, not organization data, so there's nothing to fetch it from here.
const VERIFY_CUSTOMER_SKILL_ID = "verify-customer";

// Same set the backend's requirementsMet gating checks against
// (lib/tools-integrations/registry.ts's INTEGRATION_TYPES) — kept in sync
// manually, same as the hardcoded vendor cards on Settings > Integrations.
const INTEGRATION_TYPE_OPTIONS = [
  { value: "crm", label: "CRM" },
  { value: "helpdesk", label: "Helpdesk" },
  { value: "ticketing", label: "Ticketing" },
  { value: "project_management", label: "Project management" },
  { value: "email", label: "Email" },
  { value: "calendar", label: "Calendar" },
];

const emptyForm: CustomSkillInput = { name: "", description: "", requires: [], body: "" };

const SKILL_BODY_MAX_LENGTH = 6000;
const PANEL_CLASS = "m-4 w-full max-w-5xl overflow-hidden bg-white p-0 dark:bg-gray-900 rounded-2xl";

export default function SkillsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  const [catalog, setCatalog] = useState<SkillCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState("");

  // View panel (catalog skills only) — reads the real instructions, never edits in place.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewBody, setViewBody] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");

  // New / Edit custom skill panel — also how "Edit a copy" of a catalog
  // skill lands: it opens this same panel pre-filled, with editingId left
  // null so submitting creates a new custom skill rather than touching the
  // catalog original.
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomSkillInput>(emptyForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function refetchCatalog() {
    return getSkillsCatalog()
      .then((entries) => {
        setCatalog(entries);
        setLoadError("");
      })
      .catch(() => setLoadError("Could not load the skills catalog."));
  }

  useEffect(() => {
    refetchCatalog();
  }, []);

  if (!profile) return null;

  const enabled = new Set(profile.enabledSkills);
  const viewingSkill = catalog?.find((s) => s.id === viewingId) ?? null;

  function toggle(skillId: string, requirementsMet: boolean) {
    if (!requirementsMet) return;
    const next = new Set(enabled);
    if (next.has(skillId)) {
      next.delete(skillId);
    } else {
      next.add(skillId);
    }
    update("enabledSkills", Array.from(next));
  }

  function openView(skill: SkillCatalogEntry) {
    setViewingId(skill.id);
    setViewBody(null);
    setViewError("");
    setViewLoading(true);
    getSkillDetail(skill.id)
      .then((detail) => setViewBody(detail.body))
      .catch(() => setViewError("Could not load this skill's instructions."))
      .finally(() => setViewLoading(false));
  }

  function closeView() {
    setViewingId(null);
    setViewBody(null);
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setPanelOpen(true);
  }

  function openEditForm(skill: SkillCatalogEntry) {
    setEditingId(skill.id);
    setForm({ name: skill.name, description: skill.description, requires: skill.requires, body: "" });
    setFormError("");
    setPanelOpen(true);
    setFormLoading(true);
    getSkillDetail(skill.id)
      .then((detail) => setForm((current) => ({ ...current, body: detail.body })))
      .catch(() => setFormError("Could not load the current instructions. You can still overwrite them below."))
      .finally(() => setFormLoading(false));
  }

  /** "Edit a copy" from a catalog skill's View panel — a new custom skill, pre-filled. */
  function forkFromCatalog(skill: SkillCatalogEntry, body: string) {
    closeView();
    setEditingId(null);
    setForm({ name: `${skill.name} (customized)`, description: skill.description, requires: skill.requires, body });
    setFormError("");
    setPanelOpen(true);
  }

  function closeForm() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  }

  function toggleRequires(type: string) {
    setForm((current) => ({
      ...current,
      requires: current.requires.includes(type)
        ? current.requires.filter((t) => t !== type)
        : [...current.requires, type],
    }));
  }

  async function submitForm() {
    setFormSaving(true);
    setFormError("");
    try {
      if (editingId) {
        await updateCustomSkill(editingId, form);
      } else {
        await createCustomSkill(form);
      }
      await refetchCatalog();
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save this skill.");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteCustomSkill(id);
      await refetchCatalog();
    } catch {
      setLoadError("Could not delete that skill.");
    } finally {
      setDeletingId(null);
    }
  }

  const catalogSkills = catalog?.filter((s) => s.source === "catalog") ?? [];
  const customSkills = catalog?.filter((s) => s.source === "custom") ?? [];

  return (
    <>
      <SettingsPageHeader
        title="Skills"
        description="Instructions the worker can follow for a task. A skill that needs a connected integration stays off until it's connected."
        onSave={() => save(["enabledSkills"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <div>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Catalog</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Built by AI Xccelerate, ship as defaults. Toggle changes save with the button above.
        </p>

        {loadError ? (
          <p className="mt-4 text-sm text-error-600 dark:text-error-400">{loadError}</p>
        ) : !catalog ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : catalogSkills.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No catalog skills yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {catalogSkills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                icon={<BoltIcon className="size-4" />}
                isEnabled={enabled.has(skill.id)}
                onToggle={toggle}
                actions={
                  <Button size="sm" variant="outline" onClick={() => openView(skill)}>
                    View
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Custom skills</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Written for this worker. Toggling saves with the button above; adding, editing, and deleting save
              immediately.
            </p>
          </div>
          <Button size="sm" startIcon={<PlusIcon className="size-4" />} onClick={openCreateForm}>
            New skill
          </Button>
        </div>

        {catalog && customSkills.length === 0 && (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No custom skills yet.</p>
        )}

        {customSkills.length > 0 && (
          <div className="mt-3 flex flex-col gap-2.5">
            {customSkills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                icon={<PencilIcon className="size-4" />}
                isEnabled={enabled.has(skill.id)}
                onToggle={toggle}
                actions={
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditForm(skill)}>
                      Edit
                    </Button>
                    <button
                      onClick={() => void handleDelete(skill.id)}
                      disabled={deletingId === skill.id}
                      aria-label={`Delete ${skill.name}`}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-error-50 hover:text-error-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-error-500/10"
                    >
                      <TrashBinIcon className="size-4" />
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Skill repository</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The organization&apos;s published skills, shared across every agent. Not toggled one by
          one. The worker finds a skill by describing its task, so it can reach one nobody thought
          to switch on. Connects itself; the button above does not apply to it.
        </p>
        <div className="mt-4">
          <SkillRepositoryCard />
        </div>
      </section>

      {/* View: a catalog skill's real instructions. Read-only — the only way
          to change what it does is to fork it into a custom skill. */}
      <Modal
        isOpen={Boolean(viewingSkill)}
        onClose={closeView}
        ariaLabel={viewingSkill ? `View ${viewingSkill.name}` : "View skill"}
        className={PANEL_CLASS}
      >
        {viewingSkill && (
          <div className="flex h-[85vh] flex-col">
            <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-16 dark:border-gray-800 sm:px-8">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{viewingSkill.name}</h2>
                <Badge size="sm" color="light">
                  Built by AI Xccelerate
                </Badge>
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {viewingSkill.requires.length > 0 ? `Requires: ${viewingSkill.requires.join(", ")}` : "No integration required"}
                {" · "}
                {enabled.has(viewingSkill.id) ? "On for this worker" : "Off for this worker"}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Instructions
              </p>
              <div className="mt-3 text-gray-700 dark:text-gray-300">
                {viewLoading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
                ) : viewError ? (
                  <p className="text-sm text-error-600 dark:text-error-400">{viewError}</p>
                ) : (
                  <Markdown>{viewBody ?? ""}</Markdown>
                )}
              </div>

              {viewingSkill.id === VERIFY_CUSTOMER_SKILL_ID && (
                <div className="mt-6 border-t border-gray-100 pt-5 dark:border-gray-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Skill settings
                  </p>
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600 dark:border-gray-800 dark:bg-white/5 dark:text-gray-300">
                    Turning this skill off here also turns off &ldquo;Require user verification&rdquo; under
                    Guardrails. They&apos;re the same setting shown in both places.
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800 sm:px-8">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Built-in steps can&apos;t be changed in place. Edit a copy instead.
              </p>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={closeView}>
                  Close
                </Button>
                <Button
                  size="sm"
                  disabled={viewLoading || Boolean(viewError)}
                  onClick={() => viewingSkill && viewBody !== null && forkFromCatalog(viewingSkill, viewBody)}
                >
                  Edit a copy
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* New / Edit custom skill — also where "Edit a copy" lands. */}
      <Modal
        isOpen={panelOpen}
        onClose={closeForm}
        ariaLabel={editingId ? "Edit custom skill" : "New custom skill"}
        className={PANEL_CLASS}
      >
        <div className="flex h-[85vh] flex-col">
          <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-16 dark:border-gray-800 sm:px-8">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {editingId ? "Edit skill" : "New skill"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Written for this worker. Saves immediately, no separate Save step.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
                />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Description <span className="font-normal text-gray-400">(shown to the worker as when to use this)</span>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Requires <span className="font-normal text-gray-400">(leave empty if this skill needs no connected integration)</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {INTEGRATION_TYPE_OPTIONS.map((opt) => {
                  const active = form.requires.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleRequires(opt.value)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? "border border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-brand-400"
                          : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mt-4 flex h-full min-h-[320px] flex-col text-sm font-medium text-gray-700 dark:text-gray-300">
              Instructions <span className="font-normal text-gray-400">(full text the worker reads when it uses this skill)</span>
              <AutoGrowTextarea
                minRows={12}
                maxRows={9999}
                maxLength={SKILL_BODY_MAX_LENGTH}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder={formLoading ? "Loading current instructions…" : undefined}
                disabled={formLoading}
                className="mt-2 w-full flex-1 resize-none rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 font-mono text-xs leading-5 text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:text-white/90"
              />
              <span className={counterClass}>
                {form.body.length}/{SKILL_BODY_MAX_LENGTH}
              </span>
            </label>

            {formError && (
              <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">{formError}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800 sm:px-8">
            <Button size="sm" variant="outline" onClick={closeForm} disabled={formSaving}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={formSaving}
              disabled={!form.name.trim() || !form.description.trim() || !form.body.trim()}
              onClick={() => void submitForm()}
            >
              {editingId ? "Save changes" : "Create skill"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function SkillRow({
  skill,
  icon,
  isEnabled,
  onToggle,
  actions,
}: {
  skill: SkillCatalogEntry;
  icon: React.ReactNode;
  isEnabled: boolean;
  onToggle: (id: string, requirementsMet: boolean) => void;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
        isEnabled
          ? "border-brand-500 bg-brand-25 dark:border-brand-500/60 dark:bg-brand-500/[0.06]"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      }`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
          isEnabled
            ? "bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
            : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{skill.name}</p>
          {skill.requires.length > 0 && (
            <Badge size="sm" color={skill.requirementsMet ? "success" : "light"}>
              {skill.requires.join(", ")}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{skill.description}</p>
        {!skill.requirementsMet && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Connect {skill.requires.join(" and ")} under Integrations to enable this skill.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {actions}
        <button
          role="switch"
          aria-checked={isEnabled}
          aria-label={`${isEnabled ? "Disable" : "Enable"} ${skill.name}`}
          disabled={!skill.requirementsMet}
          onClick={() => onToggle(skill.id, skill.requirementsMet)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
            isEnabled ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
          } ${!skill.requirementsMet ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform ${
              isEnabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}
