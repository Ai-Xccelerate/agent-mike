"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import {
  createCustomSkill,
  deleteCustomSkill,
  getSkillsCatalog,
  updateCustomSkill,
  type CustomSkillInput,
  type SkillCatalogEntry,
} from "@/lib/worker-api";

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

export default function SkillsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  const [catalog, setCatalog] = useState<SkillCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomSkillInput>(emptyForm);
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

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
  }

  // GET /api/v1/skills doesn't return the full body (only name/description/
  // requires) — leaving it blank here and only sending it on submit if the
  // user actually typed something avoids silently overwriting the existing
  // instructions with an empty string.
  function openEditForm(skill: SkillCatalogEntry) {
    setEditingId(skill.id);
    setForm({ name: skill.name, description: skill.description, requires: skill.requires, body: "" });
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
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
        // Only send body if the user actually typed something — it's blank
        // on open (see openEditForm), so an empty value here means "leave
        // the existing instructions as they are," not "clear them."
        const { body, ...rest } = form;
        await updateCustomSkill(editingId, body.trim() ? form : rest);
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
        description="Repeatable instruction sets the worker can follow — a Skill relies on Tools/Integrations without being one itself. A skill that needs a connected integration stays off until that integration is connected."
        onSave={() => save(["enabledSkills"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Catalog</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Built by AI Xccelerate, ship as defaults. Toggle changes save with the button above.
        </p>

        {loadError ? (
          <p className="mt-4 text-sm text-error-600 dark:text-error-400">{loadError}</p>
        ) : !catalog ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : catalogSkills.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No catalog skills yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
            {catalogSkills.map((skill) => (
              <SkillRow key={skill.id} skill={skill} isEnabled={enabled.has(skill.id)} onToggle={toggle} />
            ))}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Custom skills</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Written for this org. Toggling saves with the button above; adding, editing, and deleting save
              immediately.
            </p>
          </div>
          {!formOpen && (
            <Button size="sm" onClick={openCreateForm}>
              Add skill
            </Button>
          )}
        </div>

        {formOpen && (
          <div className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Description (shown to the agent as when to use this skill)
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Requires (leave empty if this skill doesn't need a connected integration)
                </label>
                <div className="mt-1 flex flex-wrap gap-3">
                  {INTEGRATION_TYPE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={form.requires.includes(opt.value)}
                        onChange={() => toggleRequires(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Instructions (full body the worker reads when it uses this skill)
                </label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  rows={6}
                  placeholder={editingId ? "Leave blank to keep the existing instructions unchanged" : undefined}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </div>
              {formError && <p className="text-sm text-error-600 dark:text-error-400">{formError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void submitForm()} loading={formSaving} disabled={formSaving}>
                  {editingId ? "Save skill" : "Create skill"}
                </Button>
                <Button size="sm" variant="outline" onClick={closeForm} disabled={formSaving}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {!formOpen && catalog && customSkills.length === 0 && (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No custom skills yet.</p>
        )}

        {!formOpen && customSkills.length > 0 && (
          <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
            {customSkills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                isEnabled={enabled.has(skill.id)}
                onToggle={toggle}
                actions={
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditForm(skill)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDelete(skill.id)}
                      loading={deletingId === skill.id}
                      disabled={deletingId === skill.id}
                    >
                      Delete
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function SkillRow({
  skill,
  isEnabled,
  onToggle,
  actions,
}: {
  skill: SkillCatalogEntry;
  isEnabled: boolean;
  onToggle: (id: string, requirementsMet: boolean) => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{skill.name}</p>
          {skill.requires.length > 0 && (
            <Badge size="sm" color={skill.requirementsMet ? "success" : "light"}>
              {skill.requires.join(", ")}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{skill.description}</p>
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
            className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${
              isEnabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}
