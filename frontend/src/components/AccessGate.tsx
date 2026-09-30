"use client";

import NoAccessScreen from "@/components/NoAccessScreen";
import { useSyncExternalStore } from "react";
import { currentAccessProblem, subscribeAccessProblem } from "@/lib/access-state";

/**
 * Shows the console until a console API call reports that this person can't
 * use Mike, then shows the no-access screen instead: one clear page rather
 * than an empty console where every panel quietly failed.
 */
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const problem = useSyncExternalStore(subscribeAccessProblem, currentAccessProblem, () => null);
  if (problem) return <NoAccessScreen problem={problem} />;
  return <>{children}</>;
}
