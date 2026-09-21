"use client";

import { useState } from "react";
import Button from "@/components/ui/button/Button";

/**
 * Which organization the external service knows this worker as.
 *
 * Parchment and AgentDB both key organizations on `clerk_org_id`, and this
 * build has no Clerk — so that id is configuration rather than something the
 * session can supply. The server resolves it in a fixed order: this per-agent
 * override, then the deployment's env var, then the local org id. The last of
 * those is the literal string "default", which no real service recognises, so
 * a deployment with neither an override nor an env var silently queries
 * nothing. This field is how one agent gets pointed at its own organization.
 *
 * Callers key this on the stored override, so a save elsewhere on the card —
 * which re-reads the whole integration — remounts the field with the server's
 * value instead of leaving a stale draft behind. That is React's own answer to
 * "reset state when a prop changes", and it keeps this component free of an
 * effect that only existed to copy a prop into state.
 *
 * Deliberately NOT saved on keystroke, unlike the selects on these cards. The
 * backend comment is blunt about the stakes — getting it wrong points the
 * worker at *another* organization's data — so a half-typed id must never
 * reach the server. It commits on an explicit press, and can always be put
 * back to whatever the server would have used on its own.
 */
export default function OrgIdOverrideField({
  serviceName,
  effectiveId,
  override,
  disabled = false,
  onSave,
}: {
  serviceName: string;
  /** The id actually being sent right now, whatever its source. */
  effectiveId: string;
  /** This agent's own value, or null when it is inheriting. */
  override: string | null;
  disabled?: boolean;
  onSave: (value: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(override ?? "");
  const [saving, setSaving] = useState(false);

  const trimmed = draft.trim();
  const dirty = trimmed !== (override ?? "");
  const inheriting = override === null;

  async function commit(value: string | null) {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
      <label className="block">
        <span className="block text-xs text-gray-500 dark:text-gray-400">
          {serviceName} organization id
        </span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            value={draft}
            disabled={disabled || saving}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={inheriting ? effectiveId : ""}
            spellCheck={false}
            className="h-10 min-w-0 flex-1 basis-56 rounded-lg border border-gray-200 bg-white px-3 font-mono text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
          <Button
            size="sm"
            disabled={disabled || saving || !dirty || trimmed.length === 0}
            onClick={() => void commit(trimmed)}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {!inheriting && (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || saving}
              onClick={() => void commit(null)}
            >
              Use server default
            </Button>
          )}
        </div>
      </label>

      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {inheriting ? (
          <>
            Inheriting <span className="font-mono">{effectiveId}</span> from the server. Set an id
            here to point this worker at its own {serviceName} organization.
          </>
        ) : (
          <>
            This worker uses <span className="font-mono">{effectiveId}</span>, its own rather than
            the server&rsquo;s.
          </>
        )}{" "}
        An id belonging to another organization would read that
        organization&rsquo;s data, so change it only against a value you have confirmed.
      </p>
    </div>
  );
}
