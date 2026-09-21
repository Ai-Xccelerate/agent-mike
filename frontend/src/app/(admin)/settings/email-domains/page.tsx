import EmailDomainsSettings from "@/components/worker/settings/EmailDomainsSettings";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Email domains | AI Xccelerate" };

export default function EmailDomainsSettingsPage() {
  return <EmailDomainsSettings />;
}
