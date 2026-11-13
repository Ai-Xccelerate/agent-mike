import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { featureFlags } from "@/lib/features";

export const dynamic = "force-dynamic";

/** Which switched-off features the manager's screens should hide. */
export async function GET(req: NextRequest) {
  await getIdentityAdapter().resolveManagerRequest(req);
  return NextResponse.json(featureFlags());
}
