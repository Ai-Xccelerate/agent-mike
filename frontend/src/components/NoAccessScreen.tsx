"use client";

const CORE_APP = (process.env.NEXT_PUBLIC_CORE_APP_URL ?? "").replace(/\/$/, "");

export default function NoAccessScreen({ reason }: { reason?: string }) {
  const manageUrl = CORE_APP ? `${CORE_APP}/dashboard/agents` : CORE_APP;

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">No access to Agent Mike</h1>
        <p className="mb-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {reason ??
            "Your organization does not have Mike enabled yet, or your account is not assigned. Ask an admin to enable Mike in AIX Core."}
        </p>
        {manageUrl && (
          <a
            href={manageUrl}
            className="inline-block rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Manage agents in Core
          </a>
        )}
      </div>
    </div>
  );
}
