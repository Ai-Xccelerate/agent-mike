"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import { getSkillsCatalog, type SkillCatalogEntry } from "@/lib/worker-api";

export default function SkillsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  const [catalog, setCatalog] = useState<SkillCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getSkillsCatalog()
      .then((entries) => setCatalog(entries))
      .catch(() => setLoadError("Could not load the skills catalog."));
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
        ) : catalog.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No catalog skills yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
            {catalog.map((skill) => {
              const isEnabled = enabled.has(skill.id);
              return (
                <div key={skill.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
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
                  <button
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`${isEnabled ? "Disable" : "Enable"} ${skill.name}`}
                    disabled={!skill.requirementsMet}
                    onClick={() => toggle(skill.id, skill.requirementsMet)}
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
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
