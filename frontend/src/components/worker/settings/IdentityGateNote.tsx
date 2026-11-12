import { identityGateNote } from "@/lib/identity-gate-note";

export default function IdentityGateNote(props: Parameters<typeof identityGateNote>[0]) {
  const note = identityGateNote(props);
  return (
    <p
      role={note.tone === "warning" ? "alert" : undefined}
      className={`mt-4 rounded-lg px-3 py-2 text-xs leading-5 ${
        note.tone === "warning"
          ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
          : "bg-gray-50 text-gray-600 dark:bg-white/[0.03] dark:text-gray-400"
      }`}
    >
      {note.text}
    </p>
  );
}
