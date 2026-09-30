"use client";

import { useClerk } from "@clerk/nextjs";
import Button from "@/components/ui/button/Button";
import type { AccessProblem } from "@/lib/access-state";

const CORE_APP = (process.env.NEXT_PUBLIC_CORE_APP_URL ?? "").replace(/\/$/, "");

/** Worded from AIX Core's own reason (GET /agents/{agent}/access). */
function copyFor(problem: AccessProblem): { title: string; body: string } {
  if (problem.kind === "unavailable") {
    return {
      title: "We couldn't check your access",
      body: "AIX Core didn't answer just now, so Mike can't confirm you're allowed in. Try again in a minute.",
    };
  }
  if (problem.reason === "agent_not_enabled_for_org") {
    return {
      title: "Mike isn't enabled for your company yet",
      body: "An owner or admin of your company can turn Mike on in AIX Core. Once they do, sign in again.",
    };
  }
  if (problem.reason === "not_assigned") {
    return {
      title: "You haven't been given access to Mike",
      body: "Your company uses Mike, but it isn't assigned to you. Ask an owner or admin of your company to add you in AIX Core.",
    };
  }
  return {
    title: "You don't have access to Mike",
    body: "Ask an owner or admin of your company to give you access in AIX Core.",
  };
}

export default function NoAccessScreen({ problem }: { problem: AccessProblem }) {
  const { signOut } = useClerk();
  const { title, body } = copyFor(problem);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900"
      >
        <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="mb-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {problem.kind === "unavailable" ? (
            <Button onClick={() => window.location.reload()}>Try again</Button>
          ) : (
            CORE_APP && (
              <a
                href={`${CORE_APP}/dashboard/agents`}
                className="inline-flex h-8 items-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Open AIX Core
              </a>
            )
          )}
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
