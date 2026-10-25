import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { readAttachment } from "@/lib/attachments";

// Reads the database per request: never statically prerender or cache this route.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWN_IN_PAGE = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * A file a visitor attached, for a signed-in manager of the same organization. Never public. Sent as a download with
 * the browser told not to guess its type, so an uploaded file can never run as a page; only the three image types may
 * be shown in place (?inline=1), for the Inbox preview.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await readAttachment(tenant.orgId, params.id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inline = req.nextUrl.searchParams.get("inline") === "1" && SHOWN_IN_PAGE.has(file.contentType);
  const encoded = encodeURIComponent(file.filename);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:",
      "Cache-Control": "private, no-store",
    },
  });
}
