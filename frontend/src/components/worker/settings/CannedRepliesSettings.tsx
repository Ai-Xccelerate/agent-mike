"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsToggle from "@/components/worker/settings/SettingsToggle";
import { cardClass, counterClass, fieldClass, labelClass, textareaClass } from "@/components/worker/settings/ui";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import {
  createCannedReply,
  deleteCannedReply,
  getCannedReplies,
  updateCannedReply,
  type CannedReply,
  type CannedReplyList,
} from "@/lib/worker-api";

const EMPTY = { title: "", situation: "", reply: "" };

/** Approved wording the worker uses when a customer's message matches the situation. Every change saves at once. */
export default function CannedRepliesSettings() {
  const [data, setData] = useState<CannedReplyList | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await getCannedReplies());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load canned replies.");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const limits = data?.limits;
  const canChange = data?.canChange ?? false;

  function open(reply?: CannedReply) {
    setEditingId(reply ? reply.id : "new");
    setForm(reply ? { title: reply.title, situation: reply.situation, reply: reply.reply } : EMPTY);
    setError("");
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const saved = await run(() => (editingId === "new" ? createCannedReply(form) : updateCannedReply(editingId as string, form)), "Could not save this reply.");
    if (saved) setEditingId(null);
  }

  return (
    <>
      <SettingsPageHeader
        title="Canned replies"
        description="Approved wording for situations that come up again and again. The worker uses it when a customer's message matches, in a chat voice and fitted to what they wrote. Changes save immediately."
      />

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {data ? `${data.replies.length} of ${limits?.perOrganization}. The worker sees up to ${limits?.inPrompt} switched-on replies.` : ""}
        </p>
        {canChange && (
          <Button size="sm" startIcon={<PlusIcon className="size-4" />} onClick={() => open()} disabled={busy || editingId !== null}>
            New reply
          </Button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>}
      {!data && !error && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
      {data && data.replies.length === 0 && editingId === null && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          No canned replies yet. Good ones come from real conversations: how your team actually answered the same question, written the way you would say it in a chat. Avoid a generic "we have received your request" line.
        </p>
      )}

      {editingId !== null && limits && (
        <div className={`${cardClass} mt-4 flex flex-col gap-4 p-5`}>
          <label className={labelClass}>
            Title
            <input className={`${fieldClass} mt-2`} maxLength={limits.title} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className={labelClass}>
            When it applies <span className="font-normal text-gray-400">(the situation, in your words)</span>
            <AutoGrowTextarea minRows={2} maxRows={6} maxLength={limits.situation} value={form.situation} onChange={(e) => setForm((f) => ({ ...f, situation: e.target.value }))} className={`${textareaClass} mt-2`} />
            <span className={counterClass}>
              {form.situation.length}/{limits.situation}
            </span>
          </label>
          <label className={labelClass}>
            What to say <span className="font-normal text-gray-400">(chat style, short, no sign-off)</span>
            <AutoGrowTextarea minRows={4} maxRows={14} maxLength={limits.reply} value={form.reply} onChange={(e) => setForm((f) => ({ ...f, reply: e.target.value }))} className={`${textareaClass} mt-2`} />
            <span className={counterClass}>
              {form.reply.length}/{limits.reply}
            </span>
          </label>
          <div className="flex justify-end gap-3">
            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} disabled={!form.title.trim() || !form.situation.trim() || !form.reply.trim()} onClick={() => void submit()}>
              {editingId === "new" ? "Add reply" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      {data && data.replies.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          {data.replies.map((reply) => (
            <div key={reply.id} className={`${cardClass} flex items-start gap-4 p-4`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{reply.title}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">When: {reply.situation}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{reply.reply}</p>
              </div>
              {canChange && (
                <div className="flex shrink-0 items-center gap-2">
                  <SettingsToggle checked={reply.enabled} label={reply.title} disabled={busy} onChange={() => void run(() => updateCannedReply(reply.id, { enabled: !reply.enabled }), "Could not change this reply.")} />
                  <Button size="sm" variant="outline" startIcon={<PencilIcon className="size-4" />} onClick={() => open(reply)} disabled={busy || editingId !== null}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" startIcon={<TrashBinIcon className="size-4" />} onClick={() => void run(() => deleteCannedReply(reply.id), "Could not delete this reply.")} disabled={busy}>
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
