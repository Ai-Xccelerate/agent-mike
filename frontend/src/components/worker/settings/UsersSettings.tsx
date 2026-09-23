"use client";

import Badge from "@/components/ui/badge/Badge";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, sectionTitleClass } from "@/components/worker/settings/ui";
import { apiFetch } from "@/lib/worker-api";
import { useEffect, useState } from "react";

type TeamMember = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  signedUp: boolean;
};

const CORE_APP_URL = (process.env.NEXT_PUBLIC_CORE_APP_URL ?? "").replace(/\/$/, "");

function initials(member: TeamMember): string {
  const source = member.displayName || member.email || "?";
  return source.slice(0, 2).toUpperCase();
}

function label(member: TeamMember): string {
  return member.displayName || member.email || "Invited teammate";
}

/**
 * Team membership lives in AIX Core, not here — invite/role-change/remove
 * all happen on Core's own pages. This just mirrors the roster (live from
 * Core when reachable, falling back to whoever has actually logged into
 * Mike at least once) so a manager can see who has access without leaving
 * this screen, matching how Nick's Team tab works.
 */
export default function UsersSettings() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch<{ members: TeamMember[] }>("/users")
      .then((data) => setMembers(data.members))
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
  }, []);

  const sorted = [...members].sort((a, b) => Number(a.signedUp === false) - Number(b.signedUp === false));

  return (
    <>
      <SettingsPageHeader title="Team" description="Who has access to this worker." />

      {CORE_APP_URL && (
        <section className={cardClass}>
          <h2 className={sectionTitleClass}>Manage team in AIX Core</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Invitations, roles, and access to this worker are all managed in AIX Core. New
            teammates show up here automatically once they&apos;re invited.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={`${CORE_APP_URL}/dashboard/team`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              Invite team in AIX Core
            </a>
            <a
              href={`${CORE_APP_URL}/dashboard/agents/manage`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              Manage Mike access
            </a>
          </div>
        </section>
      )}

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Members</h2>
        <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {sorted.map((member) => {
            const notOpened = member.signedUp === false;
            return (
              <div
                key={member.userId}
                title={notOpened ? "Hasn't opened Mike yet" : undefined}
                className={`flex items-center justify-between gap-4 py-3 ${notOpened ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    {initials(member)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">{label(member)}</p>
                    {member.displayName && member.email && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                    )}
                  </div>
                </div>
                <Badge size="sm" color={member.role === "owner" || member.role === "admin" ? "primary" : "light"}>
                  {member.role}
                </Badge>
              </div>
            );
          })}
          {loaded && !sorted.length && !error && (
            <p className="py-6 text-center text-sm text-gray-500">No team members yet.</p>
          )}
          {error && (
            <p className="py-6 text-center text-sm text-error-600 dark:text-error-400">
              Could not load the team list.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
