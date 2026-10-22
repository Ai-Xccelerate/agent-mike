import type { workerProfiles } from "@/db/schema";

type Profile = typeof workerProfiles.$inferSelect;

/** Fields a public widget is allowed to see — not the full worker row. */
export function publicWorkerIdentity(profile: Profile, defaultQuickActions?: string[]) {
  return {
    displayName: profile.displayName,
    avatarInitials: profile.avatarInitials,
    avatarUrl: profile.avatarUrl,
    accentColor: profile.accentColor,
    role: profile.role,
    status: profile.status,
    // What the widget opens with; null means its built-in greeting and chips.
    welcomeMessage: profile.welcomeMessage,
    quickActions: profile.quickActions,
    // What the widget shows when quickActions is null; decided by what this worker can do.
    ...(defaultQuickActions ? { defaultQuickActions } : {}),
  };
}
