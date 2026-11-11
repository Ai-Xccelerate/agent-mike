"use client";

import { useEffect, useState } from "react";
import { applyWidgetLook, resolveWidgetAppearance, type WidgetLook } from "@/lib/widget-appearance";
import { apiFetch, type WorkerProfile } from "@/lib/worker-api";

/**
 * Reads the worker's brand colour and appearance for a website embed and puts them on the page. `ready` turns true
 * once it has loaded or failed, so the chat can wait for it and never flashes in the wrong colour. A failure leaves
 * the app's own look, so the chat still works.
 */
export function useWidgetLook(siteToken: string): { look: WidgetLook | null; ready: boolean } {
  const [look, setLook] = useState<WidgetLook | null>(null);
  const [ready, setReady] = useState(!siteToken);

  useEffect(() => {
    if (!siteToken) return;
    let cancelled = false;
    apiFetch<WorkerProfile>("/worker", { widgetSiteToken: siteToken })
      .then((profile) => {
        if (cancelled) return;
        setLook({ accentColor: profile.accentColor, appearance: resolveWidgetAppearance(profile.widgetAppearance) });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [siteToken]);

  useEffect(() => {
    if (!look) return;
    return applyWidgetLook(document.documentElement, look, window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, [look]);

  return { look, ready };
}
