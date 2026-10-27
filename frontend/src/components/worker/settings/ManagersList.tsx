"use client";

import { useEffect, useState } from "react";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Button from "@/components/ui/button/Button";
import SettingsToggle from "@/components/worker/settings/SettingsToggle";
import { cardClass, counterClass, fieldClass, labelClass, textareaClass } from "@/components/worker/settings/ui";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import {
  createWorkerManager,
  deleteWorkerManager,
  getWorkerManagers,
  updateWorkerManager,
  type WorkerManagerEntry,
  type WorkerManagerList,
} from "@/lib/worker-api";

const EMPTY = { name: "", email: "", areas: "", backupId: "" as string, notifyOnCritical: false };

/**
 * The people a handover can be routed to. The worker picks one by what they cover, tells them (or their backup while
 * they are switched off), and tells everyone marked for Critical when it is Critical. The manager above stays the
 * fallback. Every change here saves at once.
 */
export default function ManagersList() {
  const [data, setData] = useState<WorkerManagerList | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await getWorkerManagers());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the list.");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const limits = data?.limits;
  const canChange = data?.canChange ?? false;
  const nameOf = (id: string | null) => data?.managers.find((m) => m.id === id)?.name ?? null;

  function open(manager?: WorkerManagerEntry) {
    setEditingId(manager ? manager.id : "new");
    setForm(manager ? { name: manager.name, email: manager.email, areas: manager.areas, backupId: manager.backupId ?? "", notifyOnCritical: manager.notifyOnCritical } : EMPTY);
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
    const body = { ...form, backupId: form.backupId || null };
    const saved = await run(() => (editingId === "new" ? createWorkerManager(body) : updateWorkerManager(editingId as string, body)), "Could not save this person.");
    if (saved) setEditingId(null);
  }

  return (
    <section className={`${cardClass} mt-4`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">People to route to</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            When a conversation is handed over, the worker picks the person who covers it and emails them. If they are switched off, their backup is told. People marked for Critical are also emailed when the customer cannot work. If nobody matches, the manager above is told. Changes here save at once.
          </p>
        </div>
        {canChange && (
          <Button size="sm" startIcon={<PlusIcon className="size-4" />} onClick={() => open()} disabled={busy || editingId !== null}>
            Add person
          </Button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>}
      {!data && !error && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
      {data && data.managers.length === 0 && editingId === null && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No one yet. Every handover goes to the manager above.</p>}

      {editingId !== null && limits && (
        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Name
              <input className={`${fieldClass} mt-2`} maxLength={limits.name} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className={labelClass}>
              Email
              <input type="email" className={`${fieldClass} mt-2`} maxLength={limits.email} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
          </div>
          <label className={labelClass}>
            What they cover <span className="font-normal text-gray-400">(areas or request types, in your words)</span>
            <AutoGrowTextarea minRows={2} maxRows={6} maxLength={limits.areas} value={form.areas} onChange={(e) => setForm((f) => ({ ...f, areas: e.target.value }))} className={`${textareaClass} mt-2`} placeholder="EAP Expert V3, MyAPP, utilization reports" />
            <span className={counterClass}>
              {form.areas.length}/{limits.areas}
            </span>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Backup <span className="font-normal text-gray-400">(told while this person is switched off)</span>
              <select className={`${fieldClass} mt-2`} value={form.backupId} onChange={(e) => setForm((f) => ({ ...f, backupId: e.target.value }))}>
                <option value="">No backup</option>
                {data?.managers.filter((m) => m.id !== editingId).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-3 pb-1">
              <SettingsToggle checked={form.notifyOnCritical} label="also email on Critical" onChange={() => setForm((f) => ({ ...f, notifyOnCritical: !f.notifyOnCritical }))} />
              <span className="text-sm text-gray-700 dark:text-gray-300">Also email on every Critical handover</span>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} disabled={!form.name.trim() || !form.email.trim()} onClick={() => void submit()}>
              {editingId === "new" ? "Add person" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      {data && data.managers.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          {data.managers.map((manager) => (
            <div key={manager.id} className="flex items-start gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {manager.name} <span className="font-normal text-gray-500 dark:text-gray-400">&lt;{manager.email}&gt;</span>
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Covers: {manager.areas || "anything nobody else covers"}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {nameOf(manager.backupId) ? `Backup: ${nameOf(manager.backupId)}` : "No backup"}
                  {manager.notifyOnCritical ? " · Also told on Critical" : ""}
                  {manager.enabled ? "" : " · Switched off"}
                </p>
              </div>
              {canChange && (
                <div className="flex shrink-0 items-center gap-2">
                  <SettingsToggle checked={manager.enabled} label={manager.name} disabled={busy} onChange={() => void run(() => updateWorkerManager(manager.id, { enabled: !manager.enabled }), "Could not change this person.")} />
                  <Button size="sm" variant="outline" startIcon={<PencilIcon className="size-4" />} onClick={() => open(manager)} disabled={busy || editingId !== null}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" startIcon={<TrashBinIcon className="size-4" />} onClick={() => void run(() => deleteWorkerManager(manager.id), "Could not remove this person.")} disabled={busy}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
