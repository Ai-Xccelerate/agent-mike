import { redirect } from "next/navigation";
import { redirectFromOldAddress } from "@/lib/connections";

export const dynamic = "force-dynamic";

/** Integrations moved into Settings > Connections. Old links and sign-in returns land on its Apps tab. */
export default async function IntegrationsSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(redirectFromOldAddress("apps", await searchParams));
}
