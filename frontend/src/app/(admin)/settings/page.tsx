import { redirect } from "next/navigation";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export default function SettingsIndexPage() {
  redirect("/settings/identity");
}
