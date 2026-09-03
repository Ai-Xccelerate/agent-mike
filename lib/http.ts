import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireManagerOrWidget, requireTenant, type TenantContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function withTenant(
  req: NextRequest,
  handler: (tenant: TenantContext) => Promise<Response>,
  mode: "tenant" | "widget" = "tenant",
) {
  try {
    const tenant = mode === "widget" ? await requireManagerOrWidget(req) : await requireTenant(req);
    return await handler(tenant);
  } catch (err) {
    return authErrorResponse(err);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
