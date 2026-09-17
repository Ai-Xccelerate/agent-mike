"use client";

import Script from "next/script";
import { useEffect } from "react";
import { grabScriptUrl } from "@/lib/grab";

/** Appended inside Grab's shadow root; see `polishLauncher` for why. */
const STYLE_ID = "aix-grab-fab-polish";

/**
 * Three layers rather than one: a tight contact shadow to seat the disc, a mid
 * lift, and a wide ambient. A single soft blur (what the widget ships with)
 * spreads without ever drawing an edge, which is the whole problem on a light
 * ground.
 */
const FAB_POLISH = `
.fab {
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.14),
    0 4px 10px rgba(15, 23, 42, 0.18),
    0 12px 28px rgba(15, 23, 42, 0.20) !important;
  border-color: #d7dce4 !important;
}
.fab:hover {
  box-shadow:
    0 2px 4px rgba(15, 23, 42, 0.18),
    0 6px 14px rgba(15, 23, 42, 0.22),
    0 16px 36px rgba(15, 23, 42, 0.24) !important;
}
`;

/**
 * The launcher is a white disc on a #eef1f8 ground, and the shadow it ships
 * with is a single soft blur — so in light mode its edge all but disappears.
 *
 * Its colour is deliberately left alone: the logo is orange on white and the
 * Grab project owns that. Only the shadow is deepened, which is what separates
 * the disc from the page. Dark mode needs nothing — a white disc already reads
 * against #080c17, and a darker shadow there would do nothing anyway.
 *
 * It has to be injected *into* the shadow root. A stylesheet on the page stops
 * at the boundary, so there is no selector we could write in globals.css that
 * would reach `.fab`.
 *
 * The host is found by looking for the shadow root that contains the button,
 * never by id: the widget names its own host `grab-widget`, and anything else
 * carrying that id would be returned by `getElementById` instead.
 */
function polishLauncher(): boolean {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
    const root = element.shadowRoot;
    if (!root?.querySelector("button.fab")) continue;
    if (root.getElementById(STYLE_ID)) return true;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = FAB_POLISH;
    root.appendChild(style);
    return true;
  }
  return false;
}

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

  // Polled rather than driven off the script's onLoad: the launcher mounts
  // itself some time after the script evaluates, so load is too early. Bounded
  // so a deployment where Grab never renders stops looking instead of polling
  // for the life of the session.
  useEffect(() => {
    if (!src || polishLauncher()) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (polishLauncher() || Date.now() - started > 30_000) {
        window.clearInterval(timer);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [src]);

  if (!src) return null;

  // Not `grab-widget`: the launcher gives its own host element that id, and two
  // nodes sharing one id means `getElementById` returns whichever comes first.
  return <Script id="grab-reporter" src={src} strategy="afterInteractive" />;
}
