import { redirect } from "next/navigation";
import { redirectFromOldAddress } from "@/lib/connections";

export const dynamic = "force-dynamic";

/** Tools moved into Settings > Connections. Old links and bookmarks land on its Tools tab. */
export default async function ToolsSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(redirectFromOldAddress("tools", await searchParams));
}
