import type { workerProfiles } from "@/db/schema";

type Profile = typeof workerProfiles.$inferSelect;

/** Fields a public widget is allowed to see — not the full worker row. */
export function publicWorkerIdentity(profile: Profile) {
  return {
    displayName: profile.displayName,
    avatarInitials: profile.avatarInitials,
    avatarUrl: profile.avatarUrl,
    accentColor: profile.accentColor,
    role: profile.role,
    status: profile.status,
  };
}
