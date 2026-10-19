"use client";

import { useOrganization } from "@clerk/nextjs";
import { useEffect } from "react";
import { apiFetch } from "@/lib/worker-api";

/**
 * The backend only learns an org's id from the platform, so its prompt would
 * otherwise read "an AI worker for org_3Dd3...". Once per browser session, an
 * org admin's browser passes along the name Clerk shows for the org. A
 * non-admin gets a 403, which is ignored: the next admin to sign in does it.
 */
export default function OrganizationNameSync() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const name = organization?.name;

  useEffect(() => {
    if (!orgId || !name) return;
    const key = `worker.org-name-synced.${orgId}.${name}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // Storage can be blocked; syncing again is harmless.
    }
    apiFetch("/organization", { method: "PUT", body: JSON.stringify({ name }) })
      .then(() => {
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // Not remembered; it will simply sync again next load.
        }
      })
      .catch(() => undefined);
  }, [orgId, name]);

  return null;
}
