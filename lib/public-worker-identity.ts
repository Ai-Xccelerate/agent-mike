import { resolveWidgetAppearance } from "@/lib/widget-appearance";
import type { workerProfiles } from "@/db/schema";

type Profile = typeof workerProfiles.$inferSelect;

/** Fields a public widget is allowed to see — not the full worker row. */
export function publicWorkerIdentity(profile: Profile, defaultQuickActions?: string[], identityGate = false) {
  return {
    displayName: profile.displayName,
    title: profile.title,
    avatarInitials: profile.avatarInitials,
    avatarUrl: profile.avatarUrl,
    accentColor: profile.accentColor,
    role: profile.role,
    status: profile.status,
    // What the widget opens with; null means its built-in greeting and chips.
    welcomeMessage: profile.welcomeMessage,
    quickActions: profile.quickActions,
    // Whether the widget shows the paperclip for attaching a file.
    chatAttachments: profile.chatAttachments,
    widgetAppearance: resolveWidgetAppearance(profile.widgetAppearance),
    // The widget shows a details form before the first message (lib/identity-gate.ts).
    identityGate,
    // Whether the details form also asks for an emailed code (email_code) or only a name and email.
    identityMode: profile.identityMode,
    // What the widget shows when quickActions is null; decided by what this worker can do.
    ...(defaultQuickActions ? { defaultQuickActions } : {}),
  };
}
