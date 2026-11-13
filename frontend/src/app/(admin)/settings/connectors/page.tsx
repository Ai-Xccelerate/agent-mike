import { redirect } from "next/navigation";
import { redirectFromOldAddress } from "@/lib/connections";

export const dynamic = "force-dynamic";

/** Connectors moved into Settings > Connections. Old links and bookmarks land on its Connectors tab. */
export default async function ConnectorsSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(redirectFromOldAddress("connectors", await searchParams));
}
