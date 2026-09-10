import IdentitySettings from "@/components/worker/settings/IdentitySettings";
import type { Metadata } from "next";

// The content is entirely client-fetched — force-dynamic isn't honored from
// a "use client" file, hence this thin server wrapper.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Identity | AI Worker" };

export default function IdentitySettingsPage() {
  return <IdentitySettings />;
}
