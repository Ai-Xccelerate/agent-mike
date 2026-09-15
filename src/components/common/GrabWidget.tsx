"use client";

import Script from "next/script";
import { grabScriptUrl } from "@/lib/grab";

/**
 * Loads the Grab reporter.
 *
 * Mounted from the admin layout rather than the root one, and that placement is
 * the point: the root layout also renders `/widget`, which is the chat embed
 * customers see on someone else's website. An internal bug reporter does not
 * belong there — it would put a "report a problem" launcher in front of
 * customers and let them attach screenshots of their own support conversation
 * to our internal tracker.
 *
 * `afterInteractive` because nothing on the page depends on it: the console
 * should paint and become usable before a reporting widget loads.
 *
 * Renders nothing when unconfigured, so a deployment without a Grab key simply
 * has no reporter rather than a broken script tag.
 */
export default function GrabWidget() {
  const src = grabScriptUrl();
  if (!src) return null;

  return <Script id="grab-widget" src={src} strategy="afterInteractive" />;
}
