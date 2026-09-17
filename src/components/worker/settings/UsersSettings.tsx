"use client";

import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, fieldClass, sectionTitleClass } from "@/components/worker/settings/ui";
import { apiFetch } from "@/lib/worker-api";
import { useEffect, useState } from "react";

type WorkerUser = { id: string; email: string; name: string | null; role: string };

export default function UsersSettings() {
  const [users, setUsers] = useState<WorkerUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  useEffect(() => {
    apiFetch<WorkerUser[]>("/users").then(setUsers).catch(() => undefined);
  }, []);

  async function invite() {
    if (!email.trim()) return;
    setSaving(true);
    setNotice("");
    setNoticeError(false);
    try {
      const created = await apiFetch<WorkerUser>("/users", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      setUsers((items) => [...items, created]);
      setEmail("");
      setName("");
      setNotice("Added.");
    } catch {
      setNoticeError(true);
      setNotice("Could not add this user. Check that the API is running.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SettingsPageHeader title="User management" description="Who can manage this worker." />
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Add a manager</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${fieldClass} mt-2`} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Name (optional)
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${fieldClass} mt-2`} />
          </label>
          <Button loading={saving} disabled={!email.trim()} onClick={invite}>
            Add
          </Button>
        </div>
        {notice && (
          <p className={`mt-3 text-xs ${noticeError ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-400"}`}>
            {notice}
          </p>
        )}
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Current users</h2>
        <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">{user.name || user.email}</p>
                {user.name && <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>}
              </div>
              <Badge size="sm" color="light">
                {user.role}
              </Badge>
            </div>
          ))}
          {!users.length && <p className="py-6 text-center text-sm text-gray-500">No users added yet.</p>}
        </div>
      </section>
    </>
  );
}
