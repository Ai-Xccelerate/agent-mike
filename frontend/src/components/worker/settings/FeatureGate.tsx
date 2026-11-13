"use client";

import type { ReactNode } from "react";
import { cardClass, sectionHintClass, sectionTitleClass } from "@/components/worker/settings/ui";
import { useFeatureFlags, type FeatureFlags } from "@/lib/use-features";

/** A settings page for a feature that is switched off: says so instead of showing screens that would only fail. */
export default function FeatureGate({ feature, title, children }: { feature: keyof FeatureFlags; title: string; children: ReactNode }) {
  const flags = useFeatureFlags();
  if (!flags.loaded) return null;
  if (!flags[feature]) {
    return (
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>{title} are switched off for now</h2>
        <p className={sectionHintClass}>This feature is not available yet. It will return once it has been built and tested properly.</p>
      </section>
    );
  }
  return <>{children}</>;
}
