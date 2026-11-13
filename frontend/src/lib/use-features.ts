"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/worker-api";

/** Features the server has switched off until they are tested properly (see lib/features.ts on the API). */
export type FeatureFlags = { cannedReplies: boolean; testCases: boolean; suggestedReplies: boolean };

let known: FeatureFlags | null = null;
let inflight: Promise<FeatureFlags | null> | null = null;

function load(): Promise<FeatureFlags | null> {
  if (known) return Promise.resolve(known);
  inflight ??= apiFetch<FeatureFlags>("/features")
    .then((flags) => (known = flags))
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Which switched-off features to hide. Until the answer is in (or if it can't be read) they are treated as off, so a
 * switched-off feature never flashes on screen.
 */
export function useFeatureFlags(): FeatureFlags & { loaded: boolean } {
  const [flags, setFlags] = useState<FeatureFlags | null>(known);
  useEffect(() => {
    let cancelled = false;
    void load().then((next) => !cancelled && setFlags(next));
    return () => {
      cancelled = true;
    };
  }, []);
  return {
    cannedReplies: flags?.cannedReplies ?? false,
    testCases: flags?.testCases ?? false,
    suggestedReplies: flags?.suggestedReplies ?? false,
    loaded: flags !== null,
  };
}
