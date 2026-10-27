import { NextResponse } from "next/server";
import { prewarmRequestTypeCatalogs } from "@/lib/tools-integrations/atlassian";

export const dynamic = "force-dynamic";

export async function GET() {
  // Railway calls this on every deploy: warm the Jira request types in the background so the first customer after a
  // restart does not wait for them. It never delays or fails the health check.
  void prewarmRequestTypeCatalogs().catch(() => undefined);
  return NextResponse.json({ status: "ok", service: "ai-worker-api" });
}
