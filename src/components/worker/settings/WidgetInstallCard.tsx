"use client";

import Button from "@/components/ui/button/Button";
import { apiFetch, WidgetSite } from "@/lib/worker-api";
import { useState } from "react";

export default function WidgetInstallCard() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  function embedSnippet(siteToken: string) {
    const origin = window.location.origin;
    const src = `${origin}/widget?site=${encodeURIComponent(siteToken)}`;
    return `<!-- AI Worker website widget (bound to your organization) -->
<iframe
  src="${src}"
  title="Chat"
  style="position:fixed;right:0;bottom:0;width:420px;height:720px;max-width:100vw;max-height:100vh;border:0;z-index:2147483646;background:transparent;color-scheme:light"
></iframe>`;
  }

  async function copyEmbed() {
    setError("");
    try {
      const site = await apiFetch<WidgetSite>("/widget-site");
      if (!site.siteToken) throw new Error("No site token");
      await navigator.clipboard.writeText(embedSnippet(site.siteToken));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setError("Could not create your org embed. Try again.");
    }
  }

  return (
    <div>
      <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
        Anyone who embeds this snippet talks to this worker&rsquo;s knowledge, and their conversations land in
        your inbox.
      </p>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => void copyEmbed()}>
        {copied ? "Copied!" : "Copy embed snippet"}
      </Button>
      {copied && <p className="mt-2 text-xs font-medium text-success-600 dark:text-success-400">Widget snippet copied to clipboard</p>}
      {error && <p className="mt-2 text-xs font-medium text-error-600 dark:text-error-400">{error}</p>}
    </div>
  );
}
